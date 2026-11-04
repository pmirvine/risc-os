// WimpLib Cfb: the OLE compound file reader (.doc import, task 10).
// Files are built by ./doc-helpers.mjs (spec-derived, [MS-CFB]) and
// broken on purpose; the real-file smoke test runs over the .doc
// files of the uncommitted corpus and skips when it is missing.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openCfb, isCfb, CfbError}
  from '../../tools/moreapps/!WimpLib/Cfb';
import {makeCfb, makeCfbLayout, SIGNATURE, NONE}
  from './doc-helpers.mjs';

const fill = (n, seed = 1) => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    b[i] = (i * 31 + seed * 7 + (i >> 8)) & 255;
  return b;
};
const THREE = [['WordDocument', fill(5000, 1)],
  ['1Table', fill(300, 2)], ['Data', fill(10000, 3)]];
const put = (b, at, v) =>
  new DataView(b.buffer, b.byteOffset).setUint32(at, v, true);
const put16 = (b, at, v) =>
  new DataView(b.buffer, b.byteOffset).setUint16(at, v, true);
const code = (c) => (e) => e instanceof CfbError && e.code === c;
const entry = (layout, p) => layout.entries.find((e) => e.path === p);
/** Opens and reads every stream; returns 'ok' or the CfbError code,
 *  and fails on any other throw. */
function tryAll(bytes, opts) {
  try {
    const c = openCfb(bytes, opts);
    for (const n of c.names) {
      try { c.get(n); } catch (e) {
        if (!(e instanceof CfbError)) throw e;
      }
    }
    return 'ok';
  } catch (e) {
    if (!(e instanceof CfbError)) throw e;
    return e.code;
  }
}

describe('Cfb reading', () => {
  it('round trip of three streams including one in the miniFAT', () => {
    const {bytes, layout} = makeCfbLayout({streams: THREE});
    assert.equal(entry(layout, '1Table').mini, true);
    const c = openCfb(bytes);
    assert.deepEqual(c.names, ['WordDocument', '1Table', 'Data']);
    for (const [n, data] of THREE) assert.deepEqual(c.get(n), data);
    assert.deepEqual(c.get('worddocument'), THREE[0][1]);
    assert.deepEqual(c.get('1TABLE'), THREE[1][1]);
    assert.equal(c.get('0Table'), null);
    assert.equal(c.size('data'), 10000);
    assert.equal(c.has('DATA'), true);
    assert.deepEqual([...c.streams.keys()], c.names);
    assert.deepEqual(c.streams.get('Data'), THREE[2][1]);
    assert.equal(c.sectorSize, 512);
  });

  it('empty streams, empty files and nested storages', () => {
    const c = openCfb(makeCfb({streams: [['Empty', new Uint8Array(0)],
      ['ObjectPool/_1/\x01Ole', fill(20)],
      ['ObjectPool/_1/\x01CompObj', fill(5000)],
      ['\x05SummaryInformation', fill(100)]]}));
    assert.deepEqual(c.get('Empty'), new Uint8Array(0));
    assert.deepEqual(c.get('objectpool/_1/\x01ole'), fill(20));
    assert.deepEqual(c.get('ObjectPool/_1/\x01CompObj'), fill(5000));
    assert.equal(c.get('\x01Ole'), null);
    assert.deepEqual(c.get('\x05SummaryInformation'), fill(100));
    assert.equal(c.names.length, 4);
    assert.deepEqual(openCfb(makeCfb({streams: []})).names, []);
  });

  it('a FAT chain loop throws bad-chain', () => {
    const {bytes, layout} = makeCfbLayout({streams: THREE});
    const d = entry(layout, 'Data');
    put(bytes, layout.fatOffset(d.start + 2), d.start);
    const c = openCfb(bytes);
    assert.throws(() => c.get('Data'), code('bad-chain'));
    assert.throws(() => c.get('Data'), code('bad-chain'));
    assert.deepEqual(c.get('WordDocument'), THREE[0][1]);
    assert.equal(c.streams.has('Data'), false);
    assert.equal(c.streams.size, 2);
    // the directory's own chain
    const b2 = makeCfbLayout({streams: THREE});
    put(b2.bytes, b2.layout.fatOffset(b2.layout.dirStart),
      b2.layout.dirStart);
    assert.throws(() => openCfb(b2.bytes), code('bad-chain'));
  });

  it('a chain into a special or unmapped sector throws bad-chain', () => {
    const {bytes, layout} = makeCfbLayout({streams: THREE});
    const d = entry(layout, 'Data');
    put(bytes, layout.fatOffset(d.start), 0xFFFFFFFD);
    assert.throws(() => openCfb(bytes).get('Data'), code('bad-chain'));
    put(bytes, layout.fatOffset(d.start), 0xFFFFFFF0);
    assert.throws(() => openCfb(bytes).get('Data'), code('bad-chain'));
  });

  it('a chain past the end throws truncated', () => {
    const {bytes, layout} = makeCfbLayout({streams: THREE});
    const d = entry(layout, 'Data');
    put(bytes, layout.fatOffset(d.start), 127);
    assert.throws(() => openCfb(bytes).get('Data'), code('truncated'));
    const whole = makeCfb({streams: THREE});
    const cut = openCfb(whole.subarray(0, whole.length - 600));
    assert.throws(() => cut.get('Data'), code('truncated'));
    assert.deepEqual(cut.get('1Table'), THREE[1][1]);
  });

  it('a stream size larger than its chain is cut with bad-chain', () => {
    const {bytes, layout} = makeCfbLayout({streams: THREE});
    put(bytes, layout.entryOffset(entry(layout, 'Data').sid) + 120,
      50000);
    put(bytes, layout.entryOffset(entry(layout, '1Table').sid) + 120,
      1000);
    const c = openCfb(bytes);
    assert.throws(() => c.get('Data'), code('bad-chain'));
    assert.throws(() => c.get('1Table'), code('bad-chain'));
    assert.deepEqual(c.get('WordDocument'), THREE[0][1]);
    assert.equal(c.size('Data'), 50000);
  });

  it('4096-byte sectors', () => {
    const bytes = makeCfb({streams: THREE, sectorSize: 4096});
    assert.equal(bytes[26], 4);
    const c = openCfb(bytes);
    assert.equal(c.sectorSize, 4096);
    for (const [n, data] of THREE) assert.deepEqual(c.get(n), data);
    // a version 4 size uses all 64 bits: one past 4 GB is too big
    const {bytes: b2, layout} = makeCfbLayout({streams: THREE,
      sectorSize: 4096});
    put(b2, layout.entryOffset(entry(layout, 'Data').sid) + 124, 1);
    assert.throws(() => openCfb(b2).get('Data'), code('too-big'));
    // version 3's high 32 bits are ignored, as [MS-CFB] says
    const {bytes: b3, layout: l3} = makeCfbLayout({streams: THREE});
    put(b3, l3.entryOffset(entry(l3, 'Data').sid) + 124, 0xDEADBEEF);
    assert.deepEqual(openCfb(b3).get('Data'), THREE[2][1]);
  });

  it('DIFAT: more than 109 FAT sectors', () => {
    const big = new Uint8Array(7.5 * 1024 * 1024);
    for (let i = 0; i < big.length; i += 4093) big[i] = (i >> 12) & 255;
    const {bytes, layout} = makeCfbLayout({streams: [['Big', big],
      ['Small', fill(10)]]});
    assert.ok(layout.nFat > 109 && layout.nDifat >= 1);
    const c = openCfb(bytes);
    assert.ok(Buffer.from(c.get('Big')).equals(Buffer.from(big)));
    assert.deepEqual(c.get('Small'), fill(10));
    // a DIFAT chain that loops on itself
    put(bytes, layout.sectorOffset(layout.difatIds[0]) + 508,
      layout.difatIds[0]);
    const b2 = bytes.slice();
    put(b2, 44, layout.nFat + 127);
    assert.throws(() => openCfb(b2), code('bad-chain'));
  });

  it('a miniFAT chain loop throws bad-chain', () => {
    const {bytes, layout} = makeCfbLayout({streams: THREE});
    const t = entry(layout, '1Table');
    put(bytes, layout.miniFatOffset(t.start + 3), t.start + 1);
    const c = openCfb(bytes);
    assert.throws(() => c.get('1Table'), code('bad-chain'));
    assert.deepEqual(c.get('Data'), THREE[2][1]);
    // a mini sector past the mini stream
    const b2 = makeCfbLayout({streams: THREE});
    put(b2.bytes, b2.layout.miniFatOffset(t.start), 100);
    assert.throws(() => openCfb(b2.bytes).get('1Table'),
      code('bad-chain'));
  });

  it('a directory loop is detected', () => {
    const streams = [];
    for (let i = 0; i < 20; i++) streams.push(['S' + i, fill(i + 1)]);
    for (const [link, to] of [[68, 'self'], [72, 'root'], [68, 'S4']]) {
      const {bytes, layout} = makeCfbLayout({streams});
      const victim = entry(layout, 'S7');
      const target = to === 'self' ? victim.sid : to === 'root' ? 0
        : entry(layout, to).sid;
      put(bytes, layout.entryOffset(victim.sid) + link, target);
      const t = Date.now();
      assert.throws(() => openCfb(bytes), code('bad-chain'));
      assert.ok(Date.now() - t < 100);
    }
    // a link past the directory
    const {bytes, layout} = makeCfbLayout({streams});
    put(bytes, layout.entryOffset(1) + 68, 5000);
    assert.throws(() => openCfb(bytes), code('bad-chain'));
  });

  it('directory names: 31 characters, invalid UTF-16, duplicates', () => {
    const long = 'A'.repeat(30) + 'b';
    const c = openCfb(makeCfb({streams: [[long, fill(3)],
      ['X\uD800Y', fill(4)], ['Dup', fill(5, 1)], ['dup', fill(6, 2)],
      ['Dup', fill(7, 3)], ['P\uD83D\uDE00', fill(8)],
      ['Q\uDC00\uD800', fill(9)]]}));
    assert.deepEqual(c.get('P\uD83D\uDE00'), fill(8));
    assert.deepEqual(c.get('Q\uFFFD\uFFFD'), fill(9));
    assert.deepEqual(c.get(long.toLowerCase()), fill(3));
    assert.deepEqual(c.get('X\uFFFDY'), fill(4));
    assert.equal(c.names.filter((n) => /^dup$/i.test(n)).length, 1);
    assert.deepEqual(c.get('DUP'), fill(5, 1));
    // a declared length past 64 bytes is held to 31 characters
    const {bytes, layout} = makeCfbLayout({streams: [[long, fill(3)]]});
    put16(bytes, layout.entryOffset(1) + 64, 0xFFFF);
    assert.deepEqual(openCfb(bytes).names, [long]);
  });

  it('a non-OLE file throws not-cfb', () => {
    for (const b of [new Uint8Array(0), new TextEncoder().encode(
      'PK\x03\x04 not an OLE file at all'), new Uint8Array(1000)]) {
      assert.throws(() => openCfb(b), code('not-cfb'));
    }
    assert.throws(() => openCfb('text'), code('not-cfb'));
    assert.throws(() => openCfb([...SIGNATURE]), code('not-cfb'));
    assert.throws(() => openCfb(Uint8Array.from(SIGNATURE)),
      code('truncated'));
  });

  it('isCfb on the signature only', () => {
    assert.equal(isCfb(Uint8Array.from(SIGNATURE)), true);
    assert.equal(isCfb(Uint8Array.from([...SIGNATURE, 1, 2, 3])), true);
    assert.equal(isCfb(Uint8Array.from(SIGNATURE.slice(0, 7))), false);
    const off = Uint8Array.from(SIGNATURE);
    off[7] = 0xE0;
    assert.equal(isCfb(off), false);
    assert.equal(isCfb(SIGNATURE), false);
    assert.equal(isCfb(Uint8Array.from(SIGNATURE).buffer), false);
    assert.equal(isCfb(null), false);
    assert.equal(isCfb(makeCfb({streams: THREE})), true);
  });

  it('header checks give bad-header', () => {
    const fresh = () => makeCfb({streams: THREE});
    const cases = [
      (b) => put16(b, 28, 0xFEFF), (b) => put16(b, 26, 5),
      (b) => put16(b, 30, 10), (b) => put16(b, 30, 12),
      (b) => put16(b, 32, 7), (b) => put(b, 56, 0),
      (b) => put(b, 44, 0), (b) => put(b, 44, 2 ** 31),
      (b) => put(b, 44, 0xFFFFFFFF), (b) => put(b, 48, NONE),
      (b) => put(b, 76, NONE),
    ];
    for (const patch of cases) {
      const b = fresh();
      patch(b);
      assert.throws(() => openCfb(b), code('bad-header'), String(patch));
    }
    const {bytes, layout} = makeCfbLayout({streams: THREE});
    bytes[layout.entryOffset(0) + 66] = 1;
    assert.throws(() => openCfb(bytes), code('bad-header'));
  });

  it('a header claiming 2^31 sectors', () => {
    const b = makeCfb({streams: THREE});
    put(b, 44, 2 ** 31);
    const t = Date.now();
    assert.throws(() => openCfb(b), code('bad-header'));
    put(b, 44, 1);
    put(b, 72, 2 ** 31);
    put(b, 68, 0);
    assert.doesNotThrow(() => openCfb(b));
    assert.ok(Date.now() - t < 100);
  });

  it('limits: maxBytes, maxStreams, a stream and the total', () => {
    const bytes = makeCfb({streams: THREE});
    assert.throws(() => openCfb(bytes, {maxBytes: 1000}),
      code('too-big'));
    assert.throws(() => openCfb(bytes, {maxStreams: 2}),
      code('too-big'));
    const c = openCfb(bytes, {maxStream: 6000});
    assert.throws(() => c.get('Data'), code('too-big'));
    assert.ok(c.get('WordDocument'));
    const t = openCfb(bytes, {maxTotal: 12000});
    t.get('Data');
    assert.throws(() => t.get('WordDocument'), code('too-big'));
    t.get('Data');
    const {bytes: b2, layout} = makeCfbLayout({streams: THREE});
    put(b2, layout.entryOffset(entry(layout, 'Data').sid) + 120,
      65 * 1024 * 1024);
    assert.throws(() => openCfb(b2).get('Data'), code('too-big'));
  });

  it('3000 small streams open and read quickly', () => {
    const streams = [];
    for (let i = 0; i < 3000; i++) streams.push(['N' + i, fill(10, i)]);
    const bytes = makeCfb({streams});
    const t = Date.now();
    const c = openCfb(bytes);
    assert.equal(c.streams.size, 3000);
    assert.deepEqual(c.get('n2999'), fill(10, 2999));
    assert.ok(Date.now() - t < 500, (Date.now() - t) + ' ms');
  });

  it('9999 entries sharing one over-declared chain stay cheap', () => {
    // each claims the big stream's chain and one sector more: every
    // read walks the whole chain before it fails
    const big = new Uint8Array(4 * 1024 * 1024);
    const streams = [['Big', big]];
    for (let i = 0; i < 9999; i++) streams.push(['S' + i, fill(1)]);
    const {bytes, layout} = makeCfbLayout({streams});
    const b = entry(layout, 'Big');
    for (const e of layout.entries) {
      if (e.type !== 2 || e.path === 'Big') continue;
      put(bytes, layout.entryOffset(e.sid) + 116, b.start);
      put(bytes, layout.entryOffset(e.sid) + 120, big.length + 512);
    }
    const sectors = bytes.length / 512;
    const t = Date.now();
    const c = openCfb(bytes);
    assert.throws(() => c.get('S0'), code('bad-chain'));
    const once = c.stats.walked;
    assert.throws(() => c.get('S0'), code('bad-chain'));
    assert.equal(c.stats.walked, once, 'a failed stream is kept');
    assert.equal(c.streams.size, 1);
    assert.ok(c.stats.walked <= 4 * sectors + 64, String(c.stats.walked));
    assert.throws(() => c.get('S9998'), code('too-big'));
    assert.ok(Date.now() - t < 1000, (Date.now() - t) + ' ms');
    // a sound file is read within the budget, mini streams included
    const ok = openCfb(makeCfb({streams: THREE}));
    for (const [n, data] of THREE) assert.deepEqual(ok.get(n), data);
    assert.ok(ok.stats.walked > 0);
  });

  it('truncated at every 512 bytes: a CfbError or success', () => {
    for (const ss of [512, 4096]) {
      const whole = makeCfb({streams: THREE, sectorSize: ss});
      for (let n = 0; n <= whole.length; n += 512) {
        const t = Date.now();
        const got = tryAll(whole.subarray(0, n));
        assert.ok(Date.now() - t < 100, `${ss}: ${n} took long`);
        if (n === whole.length) assert.equal(got, 'ok');
        if (n < 512 + ss) assert.notEqual(got, 'ok', `${ss}: ${n}`);
      }
    }
  });

  it('a seeded fuzz of 300 mutated copies', () => {
    const whole = makeCfb({streams: [...THREE, ['S/T', fill(80)]]});
    let seed = 0x1234567;
    const rnd = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const counts = {};
    for (let i = 0; i < 300; i++) {
      const b = whole.slice();
      const hits = 1 + Math.floor(rnd() * 8);
      for (let k = 0; k < hits; k++) {
        // aim at the header, the FAT and the directory half the time
        const at = rnd() < 0.5 ? Math.floor(rnd() * 1536)
          : Math.floor(rnd() * b.length);
        b[at] = rnd() < 0.3 ? 0xFF : Math.floor(rnd() * 256);
      }
      const t = Date.now();
      const got = tryAll(b);
      assert.ok(Date.now() - t < 100, 'copy ' + i);
      counts[got] = (counts[got] || 0) + 1;
    }
    assert.ok(counts.ok > 0 && Object.keys(counts).length > 1,
      JSON.stringify(counts));
  });
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const DIRS = ['corpus/poi-doc', 'corpus/converted/doc',
  'word-check-out/doc-from-word'].map((d) => path.join(ROOT, d));
function docFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.doc$/i.test(e.name)) out.push(p);
    }
  };
  for (const d of DIRS) if (fs.existsSync(d)) walk(d);
  return out.sort();
}
const FILES = docFiles();

describe('Cfb over the corpus', {skip: FILES.length ? false :
  'no .doc corpus (optional, git-ignored: tools/moreapps-corpus.mjs)'},
() => {
  it('every .doc opens or throws CfbError within 2 s', (t) => {
    const counts = {opened: 0, word: 0, magic: 0, streamErrors: 0};
    for (const f of FILES) {
      const bytes = new Uint8Array(fs.readFileSync(f));
      const start = Date.now();
      try {
        const c = openCfb(bytes);
        counts.opened++;
        if (c.has('WordDocument')) counts.word++;
        // the stream starts with Word's magic number (97+ or 6/95)
        let w = null;
        try { w = c.get('WordDocument'); } catch { /* counted below */ }
        if (w && w.length > 2 && [0xA5EC, 0xA5DC].includes(
          w[0] | w[1] << 8)) counts.magic++;
        for (const n of c.names) {
          try { c.get(n); } catch (e) {
            if (!(e instanceof CfbError)) throw e;
            counts.streamErrors++;
            counts['stream ' + e.code] =
              (counts['stream ' + e.code] || 0) + 1;
          }
        }
      } catch (e) {
        if (!(e instanceof CfbError))
          throw new Error(path.relative(ROOT, f) + ': ' + e.stack);
        counts[e.code] = (counts[e.code] || 0) + 1;
        t.diagnostic(path.relative(ROOT, f) + ': ' + e.code + ' ' +
          e.message);
      }
      assert.ok(Date.now() - start < 2000, f);
    }
    t.diagnostic(FILES.length + ' files: ' + JSON.stringify(counts));
    assert.ok(counts.word > 0);
    assert.ok(counts.magic >= counts.word * 0.95, 'magic numbers');
  });
});
