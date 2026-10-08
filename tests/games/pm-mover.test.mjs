import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNIT, STEP, steps } from '../../tools/games/!Pacman/Mover';

test('constants', () => {
  assert.equal(UNIT, 1e6);
  assert.equal(STEP, 12626);
});

test('600 frames per speed', () => {
  for (const pct of [40, 50, 75, 80, 85, 90, 95, 100, 105, 200]) {
    const a = { acc: 0 };
    let sum = 0;
    for (let i = 0; i < 600; i++) {
      sum += steps(a, pct);
      assert.ok(a.acc >= 0 && a.acc < UNIT);
    }
    assert.equal(sum, Math.floor(pct * 12626 * 600 / 1e6), 'pct ' + pct);
  }
  const t = (pct) => {
    const a = { acc: 0 };
    let s = 0;
    for (let i = 0; i < 600; i++) s += steps(a, pct);
    return s;
  };
  assert.deepEqual([t(80), t(75), t(100)], [606, 568, 757]);
});
