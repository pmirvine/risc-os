// WimpLib/NumberField: what a number field (the toolbar's size field)
// holds, read and written: '11.5' is 11.5 points, 23 half-points;
// sizes are clamped to 1..400 points; anything not a plain number is
// refused (null).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseNumber, formatNumber, halfPoints, formatPoints}
  from '../../tools/moreapps/!WimpLib/NumberField';

describe('NumberField', () => {
  it('halfPoints: sizes in points -> half-points', () => {
    assert.equal(halfPoints('11'), 22);
    assert.equal(halfPoints('11.5'), 23);
    assert.equal(halfPoints(' 24 '), 48);
    assert.equal(halfPoints('12pt'), 24);
    assert.equal(halfPoints('12 PT'), 24);
    assert.equal(halfPoints('.5'), 1 * 2);   // clamped to 1 pt
    assert.equal(halfPoints('11.3'), 23);    // nearest half point
    assert.equal(halfPoints('11.2'), 22);
  });

  it('halfPoints clamps to 1..400 points', () => {
    assert.equal(halfPoints('0'), 2);
    assert.equal(halfPoints('999'), 800);
    assert.equal(halfPoints('400'), 800);
    assert.equal(halfPoints('1'), 2);
  });

  it('halfPoints refuses what is not a plain number', () => {
    for (const t of ['abc', '', '   ', '1e3', '12px', '1.2.3', '-3',
      '+4', '0x10', 'Infinity', 'NaN', '.', '1,5', null, undefined, 12,
      '9'.repeat(400)]) {
      assert.equal(halfPoints(t), t === '9'.repeat(400) ? 800 : null,
        String(t).slice(0, 20));
    }
  });

  it('parseNumber: step, min, max, unit', () => {
    assert.equal(parseNumber('2.26', {step: 0.25}), 2.25);
    assert.equal(parseNumber('5', {min: 10}), 10);
    assert.equal(parseNumber('50', {max: 10}), 10);
    assert.equal(parseNumber('3cm', {unit: 'cm'}), 3);
    assert.equal(parseNumber('3cm'), null);
    assert.equal(parseNumber('7'), 7);
  });

  it('formatPoints / formatNumber', () => {
    assert.equal(formatPoints(11), '11');
    assert.equal(formatPoints(11.5), '11.5');
    assert.equal(formatPoints(10.25), '10.5');  // half points
    assert.equal(formatPoints(null), '');
    assert.equal(formatPoints(NaN), '');
    assert.equal(formatPoints(Infinity), '');
    assert.equal(formatNumber(2.125, 2), '2.13');
    assert.equal(formatNumber(2, 2), '2');
    assert.equal(formatNumber(-0.5, 1), '-0.5');
  });

  it('round trip: every half point from 1 to 400', () => {
    for (let h = 2; h <= 800; h++) {
      assert.equal(halfPoints(formatPoints(h / 2)), h);
    }
  });
});
