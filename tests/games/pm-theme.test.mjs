import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITLE, GHOSTS, FRUIT, COLOURS } from '../../tools/games/!Pacman/Theme';

const isColour = (c) => Array.isArray(c) && c.length === 3
  && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);

test('four ghosts, eight fruit', () => {
  assert.equal(TITLE, 'Pacman');
  assert.deepEqual(GHOSTS.map((g) => g.id), [0, 1, 2, 3]);
  assert.deepEqual(GHOSTS.map((g) => g.name),
    ['Blinky', 'Pinky', 'Inky', 'Clyde']);
  assert.deepEqual(GHOSTS.map((g) => g.nickname),
    ['Shadow', 'Speedy', 'Bashful', 'Pokey']);
  assert.equal(FRUIT.length, 8);
  assert.equal(FRUIT[5], 'rocket');
});

test('colours are three integers 0-255', () => {
  for (const [k, c] of Object.entries(COLOURS)) {
    if (k === 'ghosts') assert.equal(c.length, 4);
    for (const x of k === 'ghosts' ? c : [c]) assert.ok(isColour(x), k);
  }
  for (const g of GHOSTS) assert.ok(isColour(g.colour));
});
