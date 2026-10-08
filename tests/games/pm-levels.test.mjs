import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, levelSpec, schedule, houseLimits, idleLimit, mazeWhite }
  from '../../tools/games/!Pacman/Levels';

// The appendix table: [first, last, pac, pacFright, ghost, tunnel,
// ghostFright, elroy1 dots, pct, elroy2 dots, pct, seconds, flashes].
const N = null;
const TABLE = [
  [1, 1, 80, 90, 75, 40, 50, 20, 80, 10, 85, 6, 5],
  [2, 2, 90, 95, 85, 45, 55, 30, 90, 15, 95, 5, 5],
  [3, 3, 90, 95, 85, 45, 55, 40, 90, 20, 95, 4, 5],
  [4, 4, 90, 95, 85, 45, 55, 40, 90, 20, 95, 3, 5],
  [5, 5, 100, 100, 95, 50, 60, 40, 100, 20, 105, 2, 5],
  [6, 6, 100, 100, 95, 50, 60, 50, 100, 25, 105, 5, 5],
  [7, 8, 100, 100, 95, 50, 60, 50, 100, 25, 105, 2, 5],
  [9, 9, 100, 100, 95, 50, 60, 60, 100, 30, 105, 1, 3],
  [10, 10, 100, 100, 95, 50, 60, 60, 100, 30, 105, 5, 5],
  [11, 11, 100, 100, 95, 50, 60, 60, 100, 30, 105, 2, 5],
  [12, 13, 100, 100, 95, 50, 60, 80, 100, 40, 105, 1, 3],
  [14, 14, 100, 100, 95, 50, 60, 80, 100, 40, 105, 3, 5],
  [15, 16, 100, 100, 95, 50, 60, 100, 100, 50, 105, 1, 3],
  [17, 17, 100, N, 95, 50, N, 100, 100, 50, 105, N, N],
  [18, 18, 100, 100, 95, 50, 60, 100, 100, 50, 105, 1, 3],
  [19, 20, 100, N, 95, 50, N, 120, 100, 60, 105, N, N],
  [21, 255, 90, N, 95, 50, N, 120, 100, 60, 105, N, N],
];
const FRUIT = (n) => n === 1 ? ['cherries', 100]
  : n === 2 ? ['strawberry', 300] : n <= 4 ? ['peach', 500]
  : n <= 6 ? ['apple', 700] : n <= 8 ? ['grapes', 1000]
  : n <= 10 ? ['rocket', 2000] : n <= 12 ? ['bell', 3000]
  : ['key', 5000];

test('there are 17 rows and 21 levels', () => {
  assert.equal(TABLE.length, 17);
  assert.equal(LEVELS.length, 21);
});

test('every row of the appendix table', () => {
  for (const r of TABLE) {
    for (let n = r[0]; n <= Math.min(r[1], 40); n++) {
      const s = levelSpec(n);
      const got = [s.pac, s.pacFright, s.ghost, s.tunnel, s.ghostFright,
        s.elroy1Dots, s.elroy1, s.elroy2Dots, s.elroy2,
        s.frightFrames === null ? null : s.frightFrames / 60,
        s.flashes];
      assert.deepEqual(got, r.slice(2), 'level ' + n);
    }
  }
});

test('frightFrames are seconds x 60', () => {
  const want = [360, 300, 240, 180, 120, 300, 120, 60, 300, 120, 60,
    180, 60, null, 60, null, null];
  assert.deepEqual(TABLE.map((r) => levelSpec(r[0]).frightFrames), want);
});

test('level 22 and beyond are level 21', () => {
  for (const n of [22, 255, 1000]) {
    assert.deepEqual(levelSpec(n), levelSpec(21));
  }
});

test('the fruit of each level', () => {
  for (let n = 1; n <= 30; n++) {
    const s = levelSpec(n);
    assert.deepEqual([s.fruit, s.fruitPoints], FRUIT(n), 'level ' + n);
  }
  assert.ok(!LEVELS.some((l) => l.fruit === 'galaxian'));
});

test('house limits, idle time and schedule come with the level', () => {
  for (let n = 1; n <= 25; n++) {
    const s = levelSpec(n);
    assert.equal(s.inky, houseLimits(n)[2]);
    assert.equal(s.clyde, houseLimits(n)[3]);
    assert.equal(s.idleFrames, idleLimit(n));
    assert.deepEqual(s.schedule, schedule(n));
  }
  assert.deepEqual([levelSpec(1).idleFrames, levelSpec(5).idleFrames],
    [240, 180]);
});

test('the maze is white in four bursts of 15 frames', () => {
  const white = [];
  for (let t = 0; t < 240; t++) if (mazeWhite(t)) white.push(t);
  const want = [];
  for (const a of [120, 150, 180, 210]) {
    for (let t = a; t < a + 15; t++) want.push(t);
  }
  assert.deepEqual(white, want);
});
