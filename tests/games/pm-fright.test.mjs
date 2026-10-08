import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fright } from '../../tools/games/!Pacman/Fright';

test('flashing: the last 5 flashes of 360 frames', () => {
  const f = new Fright({ frightFrames: 360, flashes: 5 });
  for (const n of [0, 100, 219, 220, 233, 248, 261]) {
    assert.equal(f.flashWhite(n), false, 'frame ' + n);
  }
  for (const n of [234, 247, 262, 275, 359]) {
    assert.equal(f.flashWhite(n), true, 'frame ' + n);
  }
});

test('a short fright flashes from the start', () => {
  const f = new Fright({ frightFrames: 60, flashes: 3 });
  assert.equal(f.flashWhite(13), false);
  assert.equal(f.flashWhite(14), true);
  assert.equal(f.flashWhite(28), false);
});

test('no fright time: nobody turns blue', () => {
  const f = new Fright({ frightFrames: null, flashes: 0 });
  assert.equal(f.start(), false);
  assert.equal(f.on, false);
  assert.equal(f.tick(), false);
});

test('it runs for its frames and ends once', () => {
  const f = new Fright({ frightFrames: 360, flashes: 5 });
  assert.equal(f.start(), true);
  assert.equal(f.on, true);
  assert.equal(f.flashWhite(), false);
  let ended = 0, at = 0;
  for (let i = 1; i <= 400; i++) {
    if (f.tick()) { ended++; at = i; }
  }
  assert.deepEqual([ended, at, f.on], [1, 360, false]);
});

test('scores double, then stay at 1600; a restart starts over', () => {
  const f = new Fright({ frightFrames: 360, flashes: 5 });
  f.start();
  const got = [1, 2, 3, 4, 5].map(() => f.nextScore());
  assert.deepEqual(got, [200, 400, 800, 1600, 1600]);
  for (let i = 0; i < 100; i++) f.tick();
  assert.equal(f.elapsed, 100);
  f.start();
  assert.equal(f.elapsed, 0);
  assert.equal(f.nextScore(), 200);
});
