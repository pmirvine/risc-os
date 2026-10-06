import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {graphemes} from '../../tools/moreapps/!WimpLib/Segment';
import {TextMetrics, ctxMeasure}
  from '../../tools/moreapps/!WimpLib/TextMetrics';

/** 8px per UTF-16 unit, 9px when css says bold. */
function fake() {
  const g = (t, css) => (g.calls++,
    (css.includes('bold') ? 9 : 8) * t.length);
  g.calls = 0;
  return g;
}

describe('TextMetrics', () => {
  it('width uses the injected measure and caches', () => {
    const m = fake(), tm = new TextMetrics(m);
    assert.equal(tm.width('abc', '12px x'), 24);
    assert.equal(tm.width('abc', '12px x'), 24);
    assert.equal(m.calls, 1);
    assert.equal(tm.width('abc', 'bold 12px x'), 27);
    assert.equal(m.calls, 2);
  });
  it('prefixWidths has one entry per boundary, ends with width', () => {
    const tm = new TextMetrics(fake());
    const p = tm.prefixWidths('a\u{1F600}b', 'x');
    assert.deepEqual(p, [0, 8, 24, 32]);
    assert.equal(p.at(-1), tm.width('a\u{1F600}b', 'x'));
    assert.deepEqual(tm.prefixWidths('', 'x'), [0]);
  });
  it('prefixWidths is cached', () => {
    const m = fake(), tm = new TextMetrics(m);
    tm.prefixWidths('abcd', 'x');
    const n = m.calls;
    tm.prefixWidths('abcd', 'x');
    assert.equal(m.calls, n);
  });
  it('offsetAt rounds to the nearest boundary, ties left, clamps', () => {
    const tm = new TextMetrics(fake());
    assert.equal(tm.offsetAt('abc', 'x', 3), 0);
    assert.equal(tm.offsetAt('abc', 'x', 4), 0);
    assert.equal(tm.offsetAt('abc', 'x', 5), 1);
    assert.equal(tm.offsetAt('abc', 'x', 12), 1);
    assert.equal(tm.offsetAt('abc', 'x', 13), 2);
    assert.equal(tm.offsetAt('abc', 'x', -5), 0);
    assert.equal(tm.offsetAt('abc', 'x', 24), 3);
    assert.equal(tm.offsetAt('abc', 'x', 99), 3);
    assert.equal(tm.offsetAt('', 'x', 5), 0);
  });
  it('offsetAt never lands inside a surrogate pair', () => {
    const tm = new TextMetrics(fake());
    assert.equal(tm.offsetAt('\u{1F600}', 'x', 8), 0);
    assert.equal(tm.offsetAt('\u{1F600}', 'x', 9), 2);
  });
  it('LRU bound: the cache stays <= max entries', () => {
    const tm = new TextMetrics(fake(), {max: 10});
    for (let i = 0; i < 50; i++) {
      tm.width('t' + i, 'x');
      tm.prefixWidths('p' + i, 'x');
    }
    assert.ok(tm.size <= 10, 'size ' + tm.size);
  });
  it('hits stay fast with thousands of entries held', () => {
    const tm = new TextMetrics(fake());
    const w = 'the quick brown fox jumps over the lazy dog'.split(' ');
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) {
      tm.width(String(i), 'css');
      for (let k = 0; k < 50; k++) tm.width(w[k % 9], 'css');
    }
    const took = performance.now() - t0;
    assert.ok(took < 2000, `took ${took} ms`);
  });
  it('the oldest entry is dropped first', () => {
    const m = fake(), tm = new TextMetrics(m, {max: 2});
    tm.width('a', 'x'); tm.width('b', 'x'); tm.width('a', 'x');
    tm.width('c', 'x');
    const n = m.calls;
    tm.width('a', 'x');
    assert.equal(m.calls, n);
    tm.width('b', 'x');
    assert.equal(m.calls, n + 1);
  });
  it('prefix measurement, not summed widths (kerning-like)', () => {
    const kern = (t) => 8 * t.length - (t.includes('ab') ? 3 : 0);
    const tm = new TextMetrics(kern);
    assert.deepEqual(tm.prefixWidths('abc', 'x'), [0, 8, 13, 21]);
  });
  it('ctxMeasure sets the font and calls measureText', () => {
    const ctx = {font: '', measureText(t) {
      return {width: t.length * (this.font === 'f' ? 2 : 1)};
    }};
    assert.equal(ctxMeasure(ctx)('abc', 'f'), 6);
  });
  it('does not retain texts over 4096 chars', () => {
    const tm = new TextMetrics(fake());
    tm.width('x'.repeat(5000), 'c');
    tm.prefixWidths('y'.repeat(5000), 'c');
    assert.equal(tm.size, 0);
  });
  it('many distinct 3000-char strings stay within max', () => {
    const tm = new TextMetrics(() => 1, {max: 50});
    for (let i = 0; i < 20000; i++)
      tm.width(String(i).padEnd(3000, 'a'), 'c');
    assert.equal(tm.size, 50);
  });
  it('max below 1 is clamped and does not hang', () => {
    for (const max of [0, -3, NaN]) {
      const tm = new TextMetrics(fake(), {max});
      tm.width('a', 'x'); tm.width('b', 'x');
      assert.equal(tm.size, 1);
    }
  });
  it('widthTo matches width of the slice, clamped', () => {
    const tm = new TextMetrics(fake());
    assert.equal(tm.widthTo('abcd', 'x', 2), tm.width('ab', 'x'));
    assert.equal(tm.widthTo('abcd', 'x', -1), 0);
    assert.equal(tm.widthTo('abcd', 'x', 99), 32);
  });
  it('offsetAt on 100k chars makes few measures', () => {
    const m = fake(), tm = new TextMetrics(m);
    const t = 'abcde'.repeat(20000), t0 = performance.now();
    assert.equal(tm.offsetAt(t, 'x', 8 * 50000 + 3), 50000);
    assert.ok(m.calls <= 40, 'calls ' + m.calls);
    assert.ok(performance.now() - t0 < 500);
  });
  it('offsetAt equals the prefix-based answer (200 random)', () => {
    const kern = (t) => 7 * t.length - (t.match(/ab/g) || []).length * 3;
    const tm = new TextMetrics(kern), al = 'ab \u{1F600}e\u0301';
    const chars = [...al];
    for (let n = 0; n < 200; n++) {
      let t = '';
      for (let i = Math.random() * 12 | 0; i > 0; i--)
        t += chars[Math.random() * chars.length | 0];
      const x = Math.random() * 100 - 10;
      const b = graphemes(t), p = tm.prefixWidths(t, 'x');
      let want;
      if (x <= 0 || b.length < 2) want = 0;
      else if (x >= p.at(-1)) want = t.length;
      else {
        want = 0;
        for (let i = 1; i < b.length; i++) {
          if (Math.abs(p[i] - x) < Math.abs(p[want] - x)) want = i;
        }
        want = b[want];
      }
      assert.equal(tm.offsetAt(t, 'x', x), want, JSON.stringify([t, x]));
    }
  });
});
