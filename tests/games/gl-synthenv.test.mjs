import { test } from 'node:test';
import assert from 'node:assert/strict';
import { val, perc, steps, note, line, times, sweep }
  from '../../tools/games/!GameLib/SynthEnv';

test('note gives equal-tempered pitches', () => {
  assert.equal(note('A4'), 440);
  assert.ok(Math.abs(note('C4') - 261.63) < 0.01);
  assert.ok(Math.abs(note('Bb3') - 233.08) < 0.01);
});

test('perc peaks after its attack', () => {
  assert.equal(perc(0.01, 0.1)(0.01), 1);
  assert.equal(perc(0.01, 0.1)(0), 0);
});

test('steps, val, line, times, sweep', () => {
  assert.equal(steps(0.1, [1, 2, 3])(0.15), 2);
  assert.equal(steps(0.1, [1, 2, 3])(9), 3);
  assert.equal(val(5, 0), 5);
  assert.equal(val((t) => t * 2, 3), 6);
  assert.equal(line([[0, 0], [1, 10]])(0.5), 5);
  assert.equal(times(2, (t) => t)(3), 6);
  assert.equal(sweep(100, 400, 1)(1), 400);
});
