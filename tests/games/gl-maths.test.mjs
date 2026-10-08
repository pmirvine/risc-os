import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, wrap, wrapDelta, clamp, lerp }
  from '../../tools/games/!GameLib/Maths';

test('Rng matches Lander II', async () => {
  const L = await import('../../tools/lander2/!Lander2/Maths');
  const a = new Rng(7), b = new L.Rng(7);
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test('Rng helpers stay in range', () => {
  const r = new Rng(1);
  for (let i = 0; i < 500; i++) {
    const n = r.int(4);
    assert.ok(n >= 0 && n <= 3 && Number.isInteger(n));
    const f = r.float(); assert.ok(f >= 0 && f < 1);
    const g = r.range(2, 3); assert.ok(g >= 2 && g < 3);
    const s = r.signed(); assert.ok(s >= -1 && s < 1);
  }
  assert.equal(new Rng(5).chance(0), false);
});

test('wrap and wrapDelta', () => {
  assert.equal(wrap(-1, 224), 223);
  assert.equal(wrap(224, 224), 0);
  assert.equal(wrapDelta(220, 224), -4);
  assert.equal(wrapDelta(-220, 224), 4);
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(lerp(0, 10, 0.5), 5);
});
