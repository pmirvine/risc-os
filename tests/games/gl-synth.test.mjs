import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Synth, Svf } from '../../tools/games/!GameLib/Synth';

const render = (seed) => {
  const k = new Synth(24000, seed), a = k.buffer(0.1);
  k.tone(a, { wave: 'square', freq: 440, dur: 0.05 });
  k.noise(a, { hold: 4000, start: 0.05, gain: 0.5 });
  return a;
};

test('same seed gives the same samples', () => {
  assert.deepEqual(render(9), render(9));
  assert.notDeepEqual(render(9), render(10));
});

test('buffer length is seconds x rate', () => {
  assert.equal(new Synth(24000, 9).buffer(0.5).length, 12000);
  assert.equal(new Synth(24000).buffer(0).length, 1);
});

test('tone makes sound; pluck and bell fill the buffer', () => {
  const k = new Synth(8000, 3);
  for (const m of ['tone', 'pluck', 'bell']) {
    const a = k.buffer(0.2);
    k[m](a, { freq: 220 });
    assert.ok(a.some((x) => x !== 0), m);
  }
});

test('Svf lowpass passes DC', () => {
  const f = new Svf(8000, 'lp', 1000);
  let y = 0;
  for (let i = 0; i < 400; i++) y = f.run(1, i / 8000);
  assert.ok(Math.abs(y - 1) < 0.01);
});
