import { test } from 'node:test';
import assert from 'node:assert/strict';
import { House } from '../../tools/games/!Pacman/House';
import { houseLimits, idleLimit } from '../../tools/games/!Pacman/Levels';
import { PINKY, INKY, CLYDE } from '../../tools/games/!Pacman/Dirs';

function dots(h, n) { for (let i = 0; i < n; i++) h.onDot(); }

test('limits by level', () => {
  assert.deepEqual(houseLimits(1), [0, 0, 30, 60]);
  assert.deepEqual(houseLimits(2), [0, 0, 0, 50]);
  assert.deepEqual(houseLimits(3), [0, 0, 0, 0]);
  assert.deepEqual(houseLimits(20), [0, 0, 0, 0]);
  assert.equal(idleLimit(1), 240);
  assert.equal(idleLimit(4), 240);
  assert.equal(idleLimit(5), 180);
});

test('level 1: personal counters, first waiting ghost only', () => {
  const h = new House(1);
  assert.deepEqual(h.waiting, [PINKY, INKY, CLYDE]);
  assert.equal(h.tick(), PINKY);
  h.onLeft(PINKY);
  assert.equal(h.tick(), null);
  dots(h, 29);
  assert.equal(h.tick(), null);
  assert.equal(h.counts[CLYDE], 0);
  assert.equal(h.counts[INKY], 29);
  h.onDot();
  assert.equal(h.tick(), INKY);
  h.onLeft(INKY);
  dots(h, 59);
  assert.equal(h.tick(), null);
  h.onDot();
  assert.equal(h.tick(), CLYDE);
  h.onLeft(CLYDE);
  assert.equal(h.tick(), null);
});

test('level 2 and 3', () => {
  const h = new House(2);
  h.onLeft(h.tick());
  assert.equal(h.tick(), INKY);
  h.onLeft(INKY);
  dots(h, 49);
  assert.equal(h.tick(), null);
  h.onDot();
  assert.equal(h.tick(), CLYDE);
  const g = new House(3);
  for (const id of [PINKY, INKY, CLYDE]) {
    assert.equal(g.tick(), id);
    g.onLeft(id);
  }
});

test('after a death the global counter releases at 7, 17', () => {
  const h = new House(1);
  h.onDeath();
  assert.equal(h.global, true);
  assert.equal(h.globalCount, 0);
  dots(h, 6);
  assert.equal(h.tick(), null);
  h.onDot();
  assert.equal(h.tick(), PINKY);
  h.onLeft(PINKY);
  dots(h, 9);
  assert.equal(h.tick(), null);
  h.onDot();
  assert.equal(h.tick(), INKY);
  h.onLeft(INKY);
  assert.deepEqual(h.counts, [0, 0, 0, 0]);
});

test('global counter at 32 switches off without releasing Clyde', () => {
  const h = new House(1);
  h.counts[CLYDE] = 5;
  h.onDeath();
  h.onLeft(PINKY);
  h.onLeft(INKY);
  dots(h, 31);
  assert.equal(h.tick(), null);
  assert.equal(h.global, true);
  h.onDot();
  assert.equal(h.tick(), null);
  assert.equal(h.global, false);
  assert.equal(h.counts[CLYDE], 5);
  dots(h, 54);
  assert.equal(h.tick(), null);
  h.onDot();
  assert.equal(h.tick(), CLYDE);
});

test('idle timer', () => {
  for (const [lvl, n] of [[4, 240], [5, 180]]) {
    const h = new House(lvl);
    h.onLeft(PINKY);
    h.onLeft(INKY);
    // Make Clyde wait: level 4 and 5 limits are 0, so use a death.
    h.onDeath();
    for (let i = 0; i < n - 1; i++) assert.equal(h.tick(), null);
    assert.equal(h.tick(), CLYDE);
    for (let i = 0; i < n - 1; i++) assert.equal(h.tick(), null);
    h.onDot();
    for (let i = 0; i < n - 1; i++) assert.equal(h.tick(), null);
    assert.equal(h.tick(), CLYDE);
    for (let i = 0; i < n - 1; i++) assert.equal(h.tick(), null);
    assert.equal(h.tick(), CLYDE);
  }
});

test('tick repeats the due ghost until it is released or has left', () => {
  const h = new House(1);
  assert.equal(h.tick(), PINKY);
  assert.equal(h.tick(), PINKY);
  h.onRelease(PINKY);
  assert.equal(h.tick(), null);
});

test('a ghost on its way out does not count dots or block the next', () => {
  const h = new House(1);
  h.onRelease(PINKY);
  dots(h, 30);
  assert.equal(h.counts[PINKY], 0, 'Pinky does not absorb dots');
  assert.equal(h.counts[INKY], 30, 'Inky counts from the release');
  assert.equal(h.tick(), INKY);
  h.onLeft(PINKY);
  assert.deepEqual(h.waiting, [INKY, CLYDE]);
  assert.equal(h.tick(), INKY);
});

test('onRelease twice and onLeft later are harmless', () => {
  const h = new House(1);
  h.onRelease(PINKY);
  h.onRelease(PINKY);
  h.onLeft(PINKY);
  h.onLeft(PINKY);
  assert.deepEqual(h.waiting, [INKY, CLYDE]);
  assert.equal(h.tick(), null);
});

test('restart puts everyone back, keeps personal counts', () => {
  const h = new House(1);
  h.onRelease(PINKY);
  h.onLeft(PINKY);
  dots(h, 12);
  h.restart();
  h.onDeath();
  assert.deepEqual(h.waiting, [PINKY, INKY, CLYDE]);
  assert.equal(h.counts[INKY], 12);
  dots(h, 6);
  assert.equal(h.tick(), null);
  h.onDot();
  assert.equal(h.tick(), PINKY);
});

test('the idle timer counts from the first tick: 240 frames', () => {
  const h = new House(1);
  h.onRelease(PINKY);
  for (let i = 0; i < 239; i++) assert.equal(h.tick(), null);
  assert.equal(h.tick(), INKY);
});
