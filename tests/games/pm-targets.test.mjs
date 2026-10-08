import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROWS, SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { Maze } from '../../tools/games/!Pacman/Maze';
import { chaseTarget, chooseExit, frightExit }
  from '../../tools/games/!Pacman/Targets';
import { UP, LEFT, DOWN, RIGHT, BLINKY, PINKY, INKY, CLYDE }
  from '../../tools/games/!Pacman/Dirs';
import { Rng } from '../../tools/games/!GameLib/Maths';

const maze = () => new Maze(ROWS, SPECIAL);
const pac = (dir) => ({ tx: 13, ty: 23, dir });
const sc = SPECIAL.scatter;
const none = { tx: 0, ty: 0 };

test('Blinky targets Pac-Man whatever way he faces', () => {
  for (const d of [UP, LEFT, DOWN, RIGHT]) {
    assert.deepEqual(chaseTarget(BLINKY, pac(d), none, sc[0], none),
      [13, 23]);
  }
});

test('Pinky aims 4 ahead; facing up also 4 left', () => {
  const t = (d) => chaseTarget(PINKY, pac(d), none, sc[1], none);
  assert.deepEqual(t(UP), [9, 19]);
  assert.deepEqual(t(LEFT), [9, 23]);
  assert.deepEqual(t(DOWN), [13, 27]);
  assert.deepEqual(t(RIGHT), [17, 23]);
});

test('Inky doubles the line from Blinky to 2 ahead of Pac-Man', () => {
  const b = { tx: 13, ty: 11 };
  const t = (d) => chaseTarget(INKY, pac(d), b, sc[2], none);
  assert.deepEqual(t(UP), [9, 31]);
  assert.deepEqual(t(LEFT), [9, 35]);
  assert.deepEqual(t(DOWN), [13, 39]);
  assert.deepEqual(t(RIGHT), [17, 35]);
});

test('Clyde heads home within 8 tiles, else chases', () => {
  const t = (x) => chaseTarget(CLYDE, pac(LEFT), none, sc[3],
    { tx: x, ty: 23 });
  assert.deepEqual(t(20), sc[3]);
  assert.deepEqual(t(21), [13, 23]);
});

test('the scatter row is pinned', () => {
  // Unverified (see MazeData): row 32 is maze-local.
  assert.deepEqual(SPECIAL.scatter, [[25, -3], [2, -3], [27, 32], [0, 32]]);
});

test('chooseExit: ties go up, left, down, right', () => {
  assert.equal(chooseExit(maze(), [6, 5], RIGHT, [7, 4], false), UP);
});

test('chooseExit never reverses', () => {
  assert.notEqual(chooseExit(maze(), [6, 5], RIGHT, [0, 5], false), LEFT);
});

test('chooseExit never goes into the door', () => {
  assert.equal(chooseExit(maze(), [13, 11], LEFT, [13, 20], false), LEFT);
});

test('chooseExit: red zones refuse up only when asked', () => {
  const m = maze();
  assert.equal(chooseExit(m, [12, 11], RIGHT, [12, 0], false), UP);
  assert.notEqual(chooseExit(m, [12, 11], RIGHT, [12, 0], true), UP);
});

test('frightExit follows the seeded rule and never reverses', () => {
  const m = maze(), a = new Rng(1), b = new Rng(1);
  const tile = [6, 5], dir = RIGHT;
  for (let i = 0; i < 20; i++) {
    const got = frightExit(m, tile, dir, a);
    let want = b.int(4);
    const ok = (d) => d !== (dir ^ 2) &&
      m.walkable(6 + [0, -1, 0, 1][d], 5 + [-1, 0, 1, 0][d], 'ghost');
    if (!ok(want)) want = [UP, LEFT, DOWN, RIGHT].find(ok);
    assert.equal(got, want);
    assert.notEqual(got, LEFT);
  }
});
