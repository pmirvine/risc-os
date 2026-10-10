// WimpLib/Units (pure): lengths typed in a dialog field, in inches
// (shown as 0.5"), also accepted as a bare number, 'in' or points
// ('pt'); no centimetres; spacing and line heights in points. Both
// give twips (1440 an inch, 20 a point), whole, clamped; anything
// else is refused (null).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseLength, formatLength, parsePoints, formatPoints, LIMIT}
  from '../../tools/moreapps/!WimpLib/Units';

describe('Units: parseLength', () => {
  it('inches: a bare number, " and in; points with pt', () => {
    assert.equal(parseLength('0.5"'), 720);
    assert.equal(parseLength('0.5'), 720);
    assert.equal(parseLength('.5'), 720);
    assert.equal(parseLength('36 pt'), 720);
    assert.equal(parseLength('36pt'), 720);
    assert.equal(parseLength('36 PT'), 720);
    assert.equal(parseLength('1in'), 1440);
    assert.equal(parseLength(' 1 IN '), 1440);
    assert.equal(parseLength('1 "'), 1440);
    assert.equal(parseLength('2.'), 2880);
    assert.equal(parseLength('0'), 0);
  });

  it('whole twips, never -0', () => {
    assert.equal(parseLength('0.001'), 1);
    assert.equal(parseLength('0.0001'), 0);
    assert.ok(!Object.is(parseLength('-0'), -0));
    assert.ok(!Object.is(parseLength('-0.0001'), -0));
  });

  it('a minus sign; clamped to min..max', () => {
    assert.equal(parseLength('-0.5in'), -720);
    assert.equal(parseLength('-0.5in', {min: -1440}), -720);
    assert.equal(parseLength('-0.5in', {min: 0}), 0);
    assert.equal(parseLength('-2in', {min: -1440}), -1440);
    assert.equal(parseLength('3in', {max: 2880}), 2880);
    assert.equal(parseLength('1in', {min: 2000, max: 3000}), 2000);
    // with no limits given: Word's 22 inches either way
    assert.equal(LIMIT, 31680);
    assert.equal(parseLength('99'), LIMIT);
    assert.equal(parseLength('-99'), -LIMIT);
    assert.equal(parseLength('99999999999999999999999'), LIMIT);
  });

  it('refuses centimetres, other units and junk', () => {
    for (const t of ['1.27cm', '1 cm', '10mm', '1px', '1em', '2 inch',
      '1e9', '1E3', 'NaN', 'Infinity', '-Infinity', '__proto__',
      'constructor', '', '   ', '"', 'in', 'pt', '1.2.3', '+1', '--1',
      '1 2', '0x10', '1,5', '½', '1"pt', 'pt1', '1 in in', '-',
      '1 in', '١', '1\n', 'x'.repeat(10000),
      '1'.repeat(100)]) {
      assert.equal(parseLength(t), null, JSON.stringify(t));
    }
    for (const v of [null, undefined, 1, 0.5, {}, [], NaN, true]) {
      assert.equal(parseLength(v), null, String(v));
    }
  });

  it('bad limits are ignored', () => {
    assert.equal(parseLength('1', {min: NaN, max: 'x'}), 1440);
    assert.equal(parseLength('1', {min: null}), 1440);
  });
});

describe('Units: formatLength', () => {
  it('inches, 2 decimals, trailing zeros dropped', () => {
    assert.equal(formatLength(720), '0.5"');
    assert.equal(formatLength(1440), '1"');
    assert.equal(formatLength(0), '0"');
    assert.equal(formatLength(-0), '0"');
    assert.equal(formatLength(-720), '-0.5"');
    assert.equal(formatLength(1800), '1.25"');
    assert.equal(formatLength(100), '0.07"');
    assert.equal(formatLength(5), '0"');
    assert.equal(formatLength(-5), '0"');
  });

  it("'' for no length (a mixed selection)", () => {
    for (const v of [undefined, null, NaN, Infinity, '720', {}]) {
      assert.equal(formatLength(v), '', String(v));
    }
  });

  it('round trip: format -> parse', () => {
    for (let t = -31680; t <= 31680; t += 144) {
      assert.equal(parseLength(formatLength(t)), t, String(t));
    }
    for (let i = 0; i < 2000; i++) {
      const t = Math.round((Math.random() * 2 - 1) * 31680);
      const s = formatLength(t), back = parseLength(s);
      assert.ok(Math.abs(back - t) <= 7.2, `${t} ${s} ${back}`);
      assert.equal(formatLength(back), s);
    }
  });
});

describe('Units: parsePoints / formatPoints', () => {
  it('points (bare or pt) -> twips', () => {
    assert.equal(parsePoints('12'), 240);
    assert.equal(parsePoints('12 pt'), 240);
    assert.equal(parsePoints('12pt'), 240);
    assert.equal(parsePoints('6.5'), 130);
    assert.equal(parsePoints('0'), 0);
    assert.equal(parsePoints('.05'), 1);
  });

  it('clamped: 0..1584 pt unless told; min and max in twips', () => {
    assert.equal(parsePoints('-3'), 0);
    assert.equal(parsePoints('9999'), LIMIT);
    assert.equal(parsePoints('1', {min: 40}), 40);
    assert.equal(parsePoints('100', {max: 1000}), 1000);
    assert.equal(parsePoints('-3', {min: -100}), -60);
  });

  it('refuses inches, other units and junk', () => {
    for (const t of ['1in', '1"', '1cm', '1e2', 'NaN', '__proto__', '',
      'pt', '12 pt pt', '1.2.3', 'x'.repeat(5000)]) {
      assert.equal(parsePoints(t), null, JSON.stringify(t));
    }
    assert.equal(parsePoints(12), null);
  });

  it('formatPoints: twips -> points, 2 decimals', () => {
    assert.equal(formatPoints(240), '12 pt');
    assert.equal(formatPoints(130), '6.5 pt');
    assert.equal(formatPoints(0), '0 pt');
    assert.equal(formatPoints(1), '0.05 pt');
    assert.equal(formatPoints(undefined), '');
    assert.equal(formatPoints(NaN), '');
    for (let t = 0; t <= 31680; t += 7) {
      assert.equal(parsePoints(formatPoints(t)), t, String(t));
    }
  });
});
