// WimpLib InflateSync (the .doc import's metafiles, task 14 fix
// round 1): DEFLATE and zlib data inflated synchronously within a
// cap. Checked against node's zlib, which made every input here.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {inflateSync, InflateError}
  from '../../tools/moreapps/!WimpLib/InflateSync';

let seed = 12345;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) /
  0x7fffffff;
const randomBytes = (n) => Uint8Array.from({length: n}, () =>
  Math.floor(rand() * 256));
const text = new TextEncoder().encode(Array.from({length: 40000},
  (_, i) => 'word' + (i * 7919 % 1000) + ' ').join(''));
const repeat = Uint8Array.from({length: 300000}, (_, i) =>
  'abcabcabd'.charCodeAt(i % 9));
const INPUTS = {empty: new Uint8Array(0), one: Uint8Array.of(65),
  text, repeat, random: randomBytes(1 << 20)};
const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))
  === 0;

describe('InflateSync', () => {
  it('inflates what zlib deflates, at every level and strategy', () => {
    const S = zlib.constants;
    const strategies = [S.Z_DEFAULT_STRATEGY, S.Z_FILTERED,
      S.Z_HUFFMAN_ONLY, S.Z_RLE, S.Z_FIXED];
    for (const [name, d] of Object.entries(INPUTS)) {
      for (let level = 0; level <= 9; level++) {
        for (const strategy of name === 'random' && level > 1
          ? [S.Z_DEFAULT_STRATEGY] : strategies) {
          const o = {level, strategy};
          const z = zlib.deflateSync(d, o);
          const got = inflateSync(z, {max: d.length});
          assert.ok(same(got.data, zlib.inflateSync(z)), name + level);
          assert.equal(got.zlib, true);
          assert.equal(got.adler, true);
          const raw = inflateSync(zlib.deflateRawSync(d, o),
            {max: d.length, wrapper: 'raw'});
          assert.ok(same(raw.data, d), 'raw ' + name + level);
          assert.equal(raw.adler, null);
        }
      }
    }
  });

  it('auto: bare DEFLATE when the header is not zlib\'s', () => {
    const raw = zlib.deflateRawSync(text);
    const got = inflateSync(raw, {max: text.length});
    assert.ok(same(got.data, text));
    assert.equal(got.zlib, false);
    assert.throws(() => inflateSync(raw, {max: text.length,
      wrapper: 'zlib'}), {name: 'InflateError', code: 'damaged'});
  });

  it('the cap: too-big, before allocating more than it', () => {
    const zeros = zlib.deflateSync(new Uint8Array(1 << 20));
    assert.ok(zeros.length < 1100);
    const t = performance.now();
    assert.throws(() => inflateSync(zeros, {max: 65536}),
      (e) => e instanceof InflateError && e.code === 'too-big');
    assert.ok(performance.now() - t < 100);
    assert.equal(inflateSync(zeros, {max: 1 << 20}).data.length,
      1 << 20);
    assert.throws(() => inflateSync(zeros, {max: -1}), RangeError);
  });

  it('cut short at every length: only an InflateError', () => {
    const z = zlib.deflateSync(text.subarray(0, 3000), {level: 9});
    for (let n = 0; n < z.length - 4; n++) {
      assert.throws(() => inflateSync(z.subarray(0, n), {max: 3000}),
        {name: 'InflateError'}, String(n));
    }
    // (only the checksum missing: the data, adler null)
    const got = inflateSync(z.subarray(0, z.length - 4), {max: 3000});
    assert.equal(got.adler, null);
    const wrong = Uint8Array.from(z);
    wrong[wrong.length - 1] ^= 1;
    assert.equal(inflateSync(wrong, {max: 3000}).adler, false);
  });

  it('500 corrupted copies: an InflateError or data within the cap',
    () => {
      const z = zlib.deflateSync(text, {level: 6});
      let worst = 0;
      for (let k = 0; k < 500; k++) {
        const b = Uint8Array.from(z);
        for (let j = 0; j <= k % 8; j++) {
          b[Math.floor(rand() * b.length)] = Math.floor(rand() * 256);
        }
        const t = performance.now();
        try {
          const got = inflateSync(b, {max: 1 << 20});
          assert.ok(got.data.length <= 1 << 20);
        } catch (e) {
          assert.equal(e.name, 'InflateError', e.stack);
        }
        worst = Math.max(worst, performance.now() - t);
      }
      assert.ok(worst < 100, String(worst));
    });

  it('hand-made damage: block type 3, LEN / NLEN, a far distance', () => {
    const bad = (bytes) => assert.throws(() => inflateSync(
      Uint8Array.from(bytes), {max: 100, wrapper: 'raw'}),
    {name: 'InflateError', code: 'damaged'});
    bad([0x07]);                          // final, type 3
    bad([0x01, 5, 0, 0xFF, 0xFF, 1, 2, 3, 4, 5]);   // NLEN not ~LEN
    bad([0x01, 5, 0, 0xFA, 0xFF, 1, 2]);   // stored, cut short
    // fixed block: a length/distance pair with nothing before it
    bad([0x03, 0x02, 0x00, 0x00]);
    bad([]);
    assert.throws(() => inflateSync('text', {max: 1}),
      {name: 'InflateError'});
  });

  it('a dynamic block whose distance lengths are all zero (literals ' +
    'only, as zlib reads it)', () => {
    // RFC 1951 3.2.7, by hand: literals 'A' and 256 of length 1, one
    // distance code of length 0; the code length code 18 -> 0,
    // 0 -> 10, 1 -> 11; then 'A' 'A' 'A' and the end
    const bits = [];
    const num = (v, n) => {
      for (let i = 0; i < n; i++) bits.push((v >> i) & 1);
    };
    const code = (c, n) => {
      for (let i = n - 1; i >= 0; i--) bits.push((c >> i) & 1);
    };
    num(1, 1);                       // the last block
    num(2, 2);                       // dynamic
    num(0, 5);                       // HLIT: 257 lengths
    num(0, 5);                       // HDIST: 1 length
    num(14, 4);                      // HCLEN: 18 code length lengths
    const cl = {18: 1, 0: 2, 1: 2};
    for (const s of [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13,
      2, 14, 1]) num(cl[s] || 0, 3);
    const zeros = (k) => {           // (symbol 18: 11..138 zeros)
      code(0, 1);
      num(k - 11, 7);
    };
    zeros(65);                       // 0..64
    code(3, 2);                      // 'A': 1
    zeros(138);
    zeros(52);                       // 66..255
    code(3, 2);                      // 256: 1
    code(2, 2);                      // the distance code: 0
    for (const c of [0, 0, 0, 1]) code(c, 1);   // A A A, end
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    bits.forEach((b, i) => { bytes[i >> 3] |= b << (i & 7); });
    assert.equal(Buffer.from(zlib.inflateRawSync(bytes)).toString(),
      'AAA');
    const got = inflateSync(bytes, {max: 100, wrapper: 'raw'});
    assert.equal(Buffer.from(got.data).toString(), 'AAA');
  });

  it('a stored block and a 1 MB random input are fast', () => {
    const z = zlib.deflateSync(INPUTS.random, {level: 0});
    const t = performance.now();
    assert.ok(same(inflateSync(z, {max: 1 << 20}).data, INPUTS.random));
    assert.ok(performance.now() - t < 200);
  });
});
