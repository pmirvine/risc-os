// pic-fixtures.mjs jpegGray (B8.1): a real, whole grey baseline JPEG
// of any multiple-of-8 size and density, for the hand-off files
// (jpegBytes only decodes at 1 x 1). Its headers are read by ./PicMedia
// imageInfo; it holds one scan, a table of each kind, and ends in EOI.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {jpegGray} from './pic-fixtures.mjs';
import {imageInfo, decodable} from '../../tools/moreapps/!Word/PicMedia';

describe('jpegGray', () => {
  it('headers: size and density as asked', () => {
    let i = imageInfo(jpegGray(288, 144, {density: 72, units: 1}));
    assert.deepEqual([i.mime, i.w, i.h, i.dpiX, i.dpiY],
      ['image/jpeg', 288, 144, 72, 72]);
    i = imageInfo(jpegGray(240, 120, {density: 118, units: 2}));
    assert.deepEqual([i.w, i.h], [240, 120]);
    assert.ok(Math.abs(i.dpiX - 299.72) < 0.01, String(i.dpiX));
    i = imageInfo(jpegGray(16, 8, {units: 0}));
    assert.deepEqual([i.dpiX, i.dpiY], [96, 96]);
    assert.equal(decodable(i, jpegGray(16, 8)), null);
  });
  it('the scan holds one 2-bit entry per 8 x 8 block, then EOI', () => {
    const b = jpegGray(64, 32);
    assert.deepEqual([b[0], b[1], b[b.length - 2], b[b.length - 1]],
      [0xff, 0xd8, 0xff, 0xd9]);
    const sos = b.findIndex((v, k) => v === 0xff && b[k + 1] === 0xda);
    const scan = b.length - 2 - (sos + 2 + (b[sos + 2] << 8 | b[sos + 3]));
    assert.equal(scan, Math.ceil(8 * 4 * 2 / 8));
    assert.throws(() => jpegGray(10, 8), RangeError);
  });
});
