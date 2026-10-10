// PicPatch: the Picture dialog's values from a picture, and the
// setPicture patch they make (Batch B, B6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fill, patchOf } from '../../tools/moreapps/!Word/PicPatch';

const pic = (o = {}) => ({ cx: 1828800, cy: 914400, alt: 'A cat', floating: false, supported: true, ...o });
const info = { w: 40, h: 20, dpiX: 96, dpiY: 96 };
const vals = (o = {}) => ({ width: 2880, height: 1440, keep: true, alt: 'A cat', ...o });

test('fill: twips, keep on, alt, nothing shaded', () => {
  assert.deepEqual(fill(pic(), info), { width: 2880, height: 1440, keep: true, alt: 'A cat', shaded: [] });
});
test('fill: Reset size shaded without a natural size', () => {
  assert.deepEqual(fill(pic(), null).shaded, ['reset']);
});
test('fill: floating and unsupported shade the size controls, not alt', () => {
  for (const o of [{ floating: true }, { supported: false }]) {
    const f = fill(pic(o), info);
    assert.deepEqual(f.shaded.sort(), ['height', 'keep', 'reset', 'width']);
    assert.equal(f.alt, 'A cat');
  }
});
test('fill: a descr of 2000 characters shades alt and leaves it unchanged', () => {
  const f = fill(pic({ alt: 'x'.repeat(2000) }), info);
  assert.deepEqual(f.shaded, ['alt']);
  assert.equal(f.alt, undefined);
  assert.deepEqual(patchOf(vals({ alt: undefined, width: 2880 }), pic({ alt: 'x'.repeat(2000) })), {});
});
test('fill: a descr with tab and newlines is not shaded (real files have them)', () => {
  assert.deepEqual(fill(pic({ alt: 'a\tb\r\nc' }), info).shaded, []);
});
test('patchOf: a multi-line descr shown without its controls and left alone is no change', () => {
  assert.deepEqual(patchOf(vals({ alt: 'abc' }), pic({ alt: 'a\tb\r\nc' })), {});
  assert.deepEqual(patchOf(vals({ alt: 'abcd' }), pic({ alt: 'a\tb\r\nc' })), { descr: 'abcd' });
});

test('patchOf: unchanged -> {} (no step)', () => {
  assert.deepEqual(patchOf(vals(), pic()), {});
});
test('patchOf: width 2" on a 2:1 picture changed to 3" keeps proportions', () => {
  assert.deepEqual(patchOf(vals({ width: 4320 }), pic()), { cx: 2743200, cy: 1371600 });
});
test('patchOf: width 2" with keep on a 2:1 picture of 1" x 0.5" -> 2" x 1"', () => {
  const p = pic({ cx: 914400, cy: 457200 });
  assert.deepEqual(patchOf(vals({ width: 2880, height: 720 }), p), { cx: 1828800, cy: 914400 });
});
test('patchOf: height changed with keep recomputes the width', () => {
  assert.deepEqual(patchOf(vals({ height: 2880 }), pic()), { cx: 3657600, cy: 1828800 });
});
test('patchOf: keep off changes one side only', () => {
  assert.deepEqual(patchOf(vals({ keep: false, width: 4320 }), pic()), { cx: 2743200 });
});
test('patchOf: both changed (Reset size): both as given', () => {
  assert.deepEqual(patchOf(vals({ width: 1440, height: 2160 }), pic()), { cx: 914400, cy: 1371600 });
});
test('patchOf: a change below the field\'s two decimals is no change', () => {
  assert.deepEqual(patchOf(vals({ width: 2881 }), pic()), {});
});
test('patchOf: out of range or not a length -> range', () => {
  for (const w of [7, 33120, -1440, null]) {
    assert.deepEqual(patchOf(vals({ width: w }), pic()), { error: 'range' }, String(w));
    assert.deepEqual(patchOf(vals({ height: w, keep: false }), pic()), { error: 'range' }, String(w));
  }
});
test('patchOf: an emptied Width or Height is refused', () => {
  assert.deepEqual(patchOf(vals({ width: undefined }), pic()), { error: 'range' });
  assert.deepEqual(patchOf(vals({ height: undefined, keep: false }), pic()), { error: 'range' });
  assert.deepEqual(patchOf(vals({ width: undefined }), pic({ floating: true })), {});
});
test('patchOf: Reset size applies the natural extent as given, keep or not', () => {
  const nat = { cx: 1828800, cy: 1828800 };
  assert.deepEqual(patchOf(vals({ width: 2880, height: 2880 }), pic(), nat), { cy: 1828800 });
  const frac = { cx: 307848, cy: 307851 };
  assert.deepEqual(patchOf(vals({ width: 485, height: 485 }), pic(), frac), { cx: 307848, cy: 307851 });
  // the fields read back what they show: 0.34" is 490 twips
  assert.deepEqual(patchOf(vals({ width: 490, height: 490 }), pic(), frac), { cx: 307848, cy: 307851 });
  assert.deepEqual(patchOf(vals({ width: 485, height: 485, alt: 'N' }), pic(), frac), { cx: 307848, cy: 307851, descr: 'N' });
});
test('patchOf: fields edited after Reset size are what they say', () => {
  const nat = { cx: 1828800, cy: 1828800 };
  assert.deepEqual(patchOf(vals({ width: 4320, height: 2880 }), pic(), nat), { cx: 2743200, cy: 1828800 });
});
test('patchOf: a natural size out of range is refused', () => {
  assert.deepEqual(patchOf(vals({ width: 5, height: 5 }), pic(), { cx: 3175, cy: 3175 }), { error: 'range' });
});
test('patchOf: 15 and 31680 twips are accepted', () => {
  assert.deepEqual(patchOf(vals({ keep: false, width: 15 }), pic()), { cx: 9525 });
  assert.deepEqual(patchOf(vals({ keep: false, width: 31680 }), pic()), { cx: 20116800 });
});
test('patchOf: keep making the other side out of range -> range', () => {
  assert.deepEqual(patchOf(vals({ width: 31680, height: 2880 }), pic({ cx: 18288000, cy: 1828800 })), { cx: 20116800, cy: 2011680 });
  assert.deepEqual(patchOf(vals({ width: 2880, height: 28800 }), pic({ cx: 914400, cy: 18288000 })), { error: 'range' });
  assert.deepEqual(patchOf(vals({ width: 1440, height: 144 }), pic({ cx: 18288000, cy: 91440 })), { error: 'range' });
});
test('patchOf: alt text', () => {
  assert.deepEqual(patchOf(vals({ alt: 'A dog' }), pic()), { descr: 'A dog' });
  assert.deepEqual(patchOf(vals({ alt: '' }), pic()), { descr: '' });
  assert.deepEqual(patchOf(vals({ alt: undefined }), pic()), {});
});
test('patchOf: alt with a control character other than tab and line ends -> alt', () => {
  assert.deepEqual(patchOf(vals({ alt: 'a\u0007b' }), pic()), { error: 'alt' });
  assert.deepEqual(patchOf(vals({ alt: 'a\tb\nc\r' }), pic()), { descr: 'a\tb\nc\r' });
  assert.deepEqual(patchOf(vals({ alt: 'x'.repeat(1025) }), pic()), { error: 'alt' });
});
test('patchOf: floating: the size is ignored, alt accepted', () => {
  const p = pic({ floating: true });
  assert.deepEqual(patchOf(vals({ width: 4320, alt: 'B' }), p), { descr: 'B' });
  assert.deepEqual(patchOf(vals({ width: null }), p), {});
});
