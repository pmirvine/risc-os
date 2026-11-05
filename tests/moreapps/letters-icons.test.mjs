// !Letters sprites (tools/moreapps/icon.mjs iconFiles): the OpenDocument
// file icons (&A81: file_a81 34 x 34, small_a81 18 x 18) are there, and
// every other sprite is byte for byte as before (pinned digests).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {iconFiles} from '../../tools/moreapps/icon.mjs';

// [name -> {size, digest}] from the sprite file: header 12 bytes,
// then each sprite (first word its length, name at 4, w-1 words at
// 16, h-1 rows at 20)
function sprites() {
  const f = iconFiles()['!Sprites'];
  const out = {};
  let o = 12;
  while (o < f.length) {
    const n = f.readUInt32LE(o);
    const name = f.subarray(o + 4, o + 16).toString('latin1').replace(/\0+$/, '');
    out[name] = {
      rows: f.readUInt32LE(o + 20) + 1,
      digest: createHash('sha256').update(f.subarray(o, o + n))
        .digest('hex').slice(0, 16),
    };
    o += n;
  }
  assert.equal(o, f.length);
  return out;
}

const BEFORE = {
  '!letters': '849f8caa754fe179',
  'sm!letters': '81a103c494c86d65',
  file_a7e: '3ec833c226e4f2e7',
  small_a7e: 'f7d40580cd7f94af',
  file_ae6: '9f8de482dc1dc1ae',
  small_ae6: 'da06ab919f522055',
  wb_bold: '5f964df906099ab6',
  wb_italic: 'ba4b68560d381ce2',
  wb_underline: '8ee5e2ade10d0dd6',
  wb_strike: '2d14fc50bc2b46fe',
  wb_super: 'b26143d1571c63af',
  wb_sub: 'b4d0735062a15f56',
  wb_left: '850c46f1fa730efb',
  wb_centre: 'f7341ca34f1efc90',
  wb_right: 'd60b56c2b514a566',
  wb_justify: 'ba449750f9d280ee',
  wb_indmore: '75dce75c69e457b3',
  wb_indless: '964a6af615b1d6bc',
  wb_colour: '1c0158c42a006895',
  wb_highlight: 'bec3d807bfd567e1',
  wb_clear: '568bdfba9ec0855b',
  wb_style: 'fa70befe03240336',
  wb_bullets: '76dc0c20827b22e5',
  wb_numbers: '75be8e3c57850a45',
  wb_painter: '8501405d1dcc92d3',
  wb_spacing: '5ad09d5b52e1b5fb',
};

describe('!Letters sprites', () => {
  it('has file_a81 (34 x 34) and small_a81 (18 x 18)', () => {
    const s = sprites();
    assert.equal(s.file_a81?.rows, 34);
    assert.equal(s.small_a81?.rows, 18);
    assert.notEqual(s.file_a81.digest, s.file_ae6.digest);
    assert.notEqual(s.small_a81.digest, s.small_ae6.digest);
  });

  it('every other sprite is unchanged, and none is added or lost', () => {
    const s = sprites();
    for (const [n, d] of Object.entries(BEFORE)) {
      assert.equal(s[n]?.digest, d, n);
    }
    assert.deepEqual(Object.keys(s).filter((n) => !(n in BEFORE)).sort(),
      ['file_a81', 'file_a83', 'small_a81', 'small_a83']);
  });
});
