import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Modes } from '../../tools/games/!Pacman/Modes';
import { schedule } from '../../tools/games/!Pacman/Levels';

const L1 = [420, 1200, 420, 1200, 300, 1200, 300, Infinity];

test('the schedule by level', () => {
  assert.deepEqual(schedule(1), L1);
  assert.deepEqual(schedule(2),
    [420, 1200, 420, 1200, 300, 61980, 1, Infinity]);
  assert.deepEqual(schedule(4), schedule(2));
  assert.deepEqual(schedule(5),
    [300, 1200, 300, 1200, 300, 62220, 1, Infinity]);
  assert.deepEqual(schedule(21), schedule(5));
});

/** The ticks (1-based) at which tick() says the mode switched. */
function switches(level, n) {
  const m = new Modes(level), at = [];
  for (let t = 1; t <= n; t++) if (m.tick(false)) at.push(t);
  return at;
}

test('level 1 switches at the scheduled frames, then never', () => {
  const m = new Modes(1);
  assert.equal(m.mode, 'scatter');
  for (let t = 1; t < 420; t++) {
    assert.equal(m.tick(false), false);
    assert.equal(m.mode, 'scatter');
  }
  assert.equal(m.tick(false), true);
  assert.equal(m.mode, 'chase');
  assert.deepEqual(switches(1, 5100),
    [420, 1620, 2040, 3240, 3540, 4740, 5040]);
  const e = new Modes(1);
  for (let t = 0; t < 5040; t++) e.tick(false);
  assert.equal(e.mode, 'chase');
  for (let t = 0; t < 100000; t++) assert.equal(e.tick(false), false);
  assert.equal(e.mode, 'chase');
});

test('levels 2 and 5 follow their own lists', () => {
  assert.deepEqual(switches(2, 65600),
    [420, 1620, 2040, 3240, 3540, 65520, 65521]);
  assert.deepEqual(switches(5, 65600),
    [300, 1500, 1800, 3000, 3300, 65520, 65521]);
});

test('a fright stops the timer', () => {
  const m = new Modes(1);
  for (let t = 0; t < 100; t++) m.tick(false);
  const timer = m.timer;
  for (let t = 0; t < 1000; t++) assert.equal(m.tick(true), false);
  assert.equal(m.timer, timer);
  for (let t = 100; t < 419; t++) m.tick(false);
  assert.equal(m.tick(false), true);
});

test('reset restarts at phase 0 for the level', () => {
  const m = new Modes(1);
  for (let t = 0; t < 2000; t++) m.tick(false);
  assert.ok(m.phase > 0);
  m.reset(3);
  assert.deepEqual([m.mode, m.phase, m.timer], ['scatter', 0, 0]);
  assert.deepEqual(switches(3, 500), [420]);
  for (let t = 0; t < 500; t++) m.tick(false);
  assert.equal(m.mode, 'chase');
});
