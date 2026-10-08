import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROWS, SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { Maze } from '../../tools/games/!Pacman/Maze';
import { UP, LEFT, DOWN, RIGHT } from '../../tools/games/!Pacman/Dirs';

const count = (ch) => ROWS.join('').split(ch).length - 1;
const maze = () => new Maze(ROWS, SPECIAL);

test('31 rows of 28, 244 dots, symmetric', () => {
  assert.equal(ROWS.length, 31);
  for (const r of ROWS) {
    assert.equal(r.length, 28);
    assert.equal(r, [...r].reverse().join(''));
  }
  assert.equal(count('.'), 240);
  assert.equal(count('o'), 4);
  assert.equal(maze().dotsLeft, 244);
});

const walk = (c) => '.o T'.includes(c);
const open = (x, y) => y === 14 || (x >= 0 && x < 28)
  ? walk(ROWS[y]?.[(x + 28) % 28] ?? '#') : false;

test('300 walkable tiles, connected, no dead ends', () => {
  let n = 0;
  for (let y = 0; y < 31; y++) {
    for (let x = 0; x < 28; x++) if (walk(ROWS[y][x])) n++;
  }
  assert.equal(n, 300);
  const seen = new Set(['14,23']);
  const todo = [[14, 23]];
  while (todo.length) {
    const [x, y] = todo.pop();
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
      const nx = (x + dx + 28) % 28, ny = y + dy;
      if (y !== 14 && (x + dx < 0 || x + dx > 27)) continue;
      if (ny < 0 || ny > 30 || !open(x + dx, ny)) continue;
      const k = nx + ',' + ny;
      if (!seen.has(k)) { seen.add(k); todo.push([nx, ny]); }
    }
  }
  assert.equal(seen.size, 300);
  for (let y = 0; y < 31; y++) {
    for (let x = 0; x < 28; x++) {
      if (!walk(ROWS[y][x])) continue;
      const m = [[0, -1], [-1, 0], [0, 1], [1, 0]]
        .filter(([dx, dy]) => open(x + dx, y + dy)).length;
      assert.ok(m >= 2, 'dead end at ' + x + ',' + y);
    }
  }
});

test('special tiles', () => {
  for (const [x, y] of [[1, 3], [26, 3], [1, 23], [26, 23]]) {
    assert.equal(ROWS[y][x], 'o');
  }
  assert.equal(ROWS[12][13], '-');
  assert.equal(ROWS[12][14], '-');
  assert.equal(count('-'), 2);
  for (let y = 0; y < 31; y++) {
    for (let x = 0; x < 28; x++) {
      const inside = x >= 11 && x <= 16 && y >= 13 && y <= 15;
      assert.equal(ROWS[y][x] === 'H', inside);
      const tun = y === 14 && (x <= 5 || x >= 22);
      assert.equal(ROWS[y][x] === 'T', tun);
    }
  }
});

test('red zones are the 8 tiles only', () => {
  const m = maze();
  let n = 0;
  for (let y = 0; y < 31; y++) {
    for (let x = 0; x < 28; x++) {
      const want = (y === 11 || y === 23) && x >= 12 && x <= 15;
      assert.equal(m.isRedZone(x, y), want);
      if (m.isRedZone(x, y)) n++;
    }
  }
  assert.equal(n, 8);
  assert.ok(m.isTunnel(0, 14) && !m.isTunnel(6, 14));
});

test('walkable by who', () => {
  const m = maze();
  assert.equal(m.walkable(13, 12, 'pac'), false);
  assert.equal(m.walkable(13, 12, 'ghost'), false);
  assert.equal(m.walkable(13, 12, 'house'), true);
  assert.equal(m.walkable(12, 14, 'ghost'), false);
  assert.equal(m.walkable(12, 14, 'house'), true);
  assert.equal(m.walkable(-1, 14, 'pac'), true);
  assert.equal(m.walkable(28, 14, 'pac'), true);
  assert.equal(m.walkable(-1, 5, 'pac'), false);
  assert.equal(m.walkable(0, 0, 'pac'), false);
  assert.equal(m.walkable(1, 1, 'pac'), true);
});

test('exits lists the open directions', () => {
  const m = maze();
  assert.deepEqual(m.exits(1, 1), [DOWN, RIGHT]);
  assert.deepEqual(m.exits(6, 5), [UP, LEFT, DOWN, RIGHT]);
});

test('eating and reset', () => {
  const m = maze();
  assert.equal(m.dotAt(1, 1), 10);
  assert.equal(m.eat(1, 1), 10);
  assert.equal(m.eat(1, 1), 0);
  assert.equal(m.eat(1, 3), 50);
  assert.equal(m.dotsLeft, 242);
  assert.equal(m.dotsEaten, 2);
  m.reset();
  assert.equal(m.dotsLeft, 244);
  assert.equal(m.dotsEaten, 0);
  assert.equal(m.dotAt(1, 1), 10);
});

test('wallMask marks the walls', () => {
  const w = maze().wallMask();
  assert.equal(w.length, 28 * 31);
  assert.equal(w[0], 1);
  assert.equal(w[28 + 1], 0);
});

test('no dots in the band round the house, the start and the tunnel', () => {
  const m = maze();
  const free = [];
  for (let y = 9; y <= 19; y++) {
    for (let x = 0; x < 28; x++) if (x !== 6 && x !== 21) free.push([x, y]);
  }
  free.push([13, 23], [14, 23]);
  for (let x = 0; x < 28; x++) free.push([x, 14]);
  for (const [x, y] of free) {
    if (x === 6 || x === 21) continue;
    assert.equal(m.dotAt(x, y), 0, `(${x}, ${y})`);
  }
  assert.equal(m.dotAt(6, 14), 10);
});

test('the places of the appendix: exit, fruit, eyes, starts', () => {
  assert.deepEqual(SPECIAL.exit, { px: 112, py: 92 });
  assert.equal(SPECIAL.fruit.px, 112);
  assert.equal(SPECIAL.fruit.py, 140);
  assert.deepEqual(SPECIAL.fruit.tiles, [[13, 17], [14, 17]]);
  assert.deepEqual(SPECIAL.eyesTarget, [13, 11]);
  assert.equal(SPECIAL.tunnelRow, 14);
  assert.deepEqual(SPECIAL.starts.pac, { px: 112, py: 188, dir: 1 });
});
