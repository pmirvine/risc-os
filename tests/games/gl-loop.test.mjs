import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, Loop } from '../../tools/games/!GameLib/Loop';
import { fakeTimers } from './fakes.mjs';

const T = 1 / 60;

test('advance counts whole ticks', () => {
  assert.equal(advance(0, T, T).n, 1);
  const a = advance(0, 1 / 120, T);
  assert.equal(a.n, 0);
  assert.equal(advance(a.acc, 1 / 120, T).n, 1);
  assert.deepEqual(advance(0, 0.25, T), { n: 6, acc: 0 });
  assert.equal(advance(0, T, T, 2).n, 2);
});

// Run a Loop for seconds at a refresh rate; returns it.
function run(opts, fps, seconds, extra = {}) {
  const t = fakeTimers();
  const loop = new Loop({ raf: t.raf, caf: t.caf, now: t.now,
    tick: () => {}, ...opts });
  loop.start();
  t.run(1000 / fps, seconds * 1000 + 1);
  return { loop, t, ...extra };
}

test('60 Hz gives 60 ticks per second', () => {
  const { loop } = run({}, 60, 10);
  assert.ok(Math.abs(loop.ticks - 600) <= 1, String(loop.ticks));
});

test('120 Hz and 144 Hz give 60 ticks per second', () => {
  for (const fps of [120, 144]) {
    const { loop } = run({}, fps, 10);
    assert.ok(Math.abs(loop.ticks - 600) <= 1, `${fps}: ${loop.ticks}`);
    assert.ok(Math.abs(loop.frames - fps * 10) <= 1);
  }
});

test('30 Hz gives 60 ticks per second', () => {
  const { loop } = run({}, 30, 10);
  assert.ok(Math.abs(loop.ticks - 600) <= 1, String(loop.ticks));
});

test('a 300 s gap runs at most 6 ticks', () => {
  const t = fakeTimers();
  const loop = new Loop({ raf: t.raf, caf: t.caf, now: t.now,
    tick: () => {} });
  loop.start();
  t.fire(300000);
  assert.equal(loop.ticks, 6);
});

test('speed 0.5 gives 30 ticks per second', () => {
  const { loop } = run({ speed: () => 0.5 }, 60, 10);
  assert.ok(Math.abs(loop.ticks - 300) <= 1, String(loop.ticks));
});

test('tick returning false stops this frame\'s ticks', () => {
  const t = fakeTimers();
  let calls = 0;
  const loop = new Loop({ raf: t.raf, caf: t.caf, now: t.now,
    tick: () => { calls++; return false; } });
  loop.start();
  t.fire(100);                    // 6 ticks due, only one runs
  assert.equal(calls, 1);
});

test('stop() makes pending raf callbacks no-ops', () => {
  const t = fakeTimers();
  let draws = 0;
  const loop = new Loop({ raf: t.raf, caf: t.caf, now: t.now,
    tick: () => {}, draw: () => draws++ });
  loop.start();
  t.fire(17);
  assert.equal(draws, 1);
  const pending = t.queue.map((q) => q[1]);
  loop.stop();
  assert.equal(loop.running, false);
  for (const f of pending) f(40);
  assert.equal(draws, 1);
  assert.ok(t.cancelled.size >= 1);
});

test('an error in tick calls onError once and stops', () => {
  const t = fakeTimers();
  const errs = [];
  const loop = new Loop({ raf: t.raf, caf: t.caf, now: t.now,
    tick: () => { throw new Error('boom'); },
    onError: (e) => errs.push(e.message) });
  loop.start();
  t.run(17, 200);
  assert.deepEqual(errs, ['boom']);
  assert.equal(loop.running, false);
});

test('an error with no onError is rethrown and stops the loop', () => {
  const t = fakeTimers();
  const loop = new Loop({ raf: t.raf, caf: t.caf, now: t.now,
    tick: () => { throw new Error('boom'); } });
  loop.start();
  assert.throws(() => t.fire(17), /boom/);
  assert.equal(loop.running, false);
});

test('stop() inside a tick skips draw and the frame count', () => {
  const t = fakeTimers();
  let draws = 0;
  const loop = new Loop({ raf: t.raf, caf: t.caf, now: t.now,
    tick: () => loop.stop(), draw: () => draws++ });
  loop.start();
  t.fire(17);
  assert.equal(draws, 0);
  assert.equal(loop.frames, 0);
});
