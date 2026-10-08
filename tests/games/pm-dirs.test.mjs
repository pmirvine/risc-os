import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../tools/games/!Pacman/Dirs';

test('directions are numbered in tie-break order', () => {
  assert.deepEqual([D.UP, D.LEFT, D.DOWN, D.RIGHT], [0, 1, 2, 3]);
  assert.deepEqual(D.DX, [0, -1, 0, 1]);
  assert.deepEqual(D.DY, [-1, 0, 1, 0]);
  assert.equal(D.NAMES.length, 4);
});

test('reverse flips each direction', () => {
  assert.equal(D.reverse(D.UP), D.DOWN);
  assert.equal(D.reverse(D.LEFT), D.RIGHT);
  for (let d = 0; d < 4; d++) assert.equal(D.reverse(D.reverse(d)), d);
});

test('ghosts are numbered 0-3', () => {
  assert.deepEqual([D.BLINKY, D.PINKY, D.INKY, D.CLYDE], [0, 1, 2, 3]);
});
