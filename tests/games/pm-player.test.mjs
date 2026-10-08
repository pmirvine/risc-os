import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../tools/games/!Pacman/Player';
import { Maze } from '../../tools/games/!Pacman/Maze';
import { ROWS, SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { UP, LEFT, DOWN, RIGHT } from '../../tools/games/!Pacman/Dirs';

const START = SPECIAL.starts.pac;
const setup = () => ({ m: new Maze(ROWS, SPECIAL),
  p: new Player(START) });
const frames = (s, want, n, pct = 100) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(s.p.tick(s.m, want, pct));
  return out;
};

test('starts at the start and moves left', () => {
  const s = setup();
  assert.deepEqual([s.p.px, s.p.py, s.p.dir], [112, 188, LEFT]);
  assert.deepEqual([s.p.tx, s.p.ty], [14, 23]);
  const r = frames(s, -1, 10);
  assert.ok(s.p.px < 112);
  assert.ok(r.some((x) => x.moved > 0));
});

test('an impossible turn is buffered, he keeps going', () => {
  const s = setup();
  frames(s, UP, 5);
  assert.equal(s.p.dir, LEFT);
  assert.equal(s.p.py, 188);
  frames(s, UP, 20);
  assert.equal(s.p.dir, UP);
  assert.equal(s.p.px, 100);
});

test('stops at the centre of the last tile', () => {
  const s = setup();
  frames(s, LEFT, 300);
  assert.equal(s.p.stopped, true);
  assert.equal(s.p.px, 52);
  assert.deepEqual([s.p.tx, s.p.ty], [6, 23]);
  const anim = s.p.anim;
  frames(s, LEFT, 20);
  assert.equal(s.p.anim, anim);
});

test('reverses at once mid-tile', () => {
  const s = setup();
  frames(s, -1, 6);
  const x = s.p.px;
  assert.ok(x % 8 !== 4);
  s.p.tick(s.m, RIGHT, 100);
  assert.equal(s.p.dir, RIGHT);
  assert.ok(s.p.px > x);
});

test('turns at the centre of a tile with an opening', () => {
  const s = setup();
  frames(s, LEFT, 300);
  assert.equal(s.p.stopped, true);
  frames(s, DOWN, 60);
  assert.equal(s.p.dir, DOWN);
  assert.equal(s.p.px, 52);
  assert.ok(s.p.py > 188);
});

test('eats on tile entry and pauses', () => {
  const s = setup();
  let first = null, pxAtEat = 0;
  for (let i = 0; i < 40 && !first; i++) {
    const r = s.p.tick(s.m, LEFT, 100);
    if (r.ate) { first = r; pxAtEat = s.p.px; }
  }
  assert.equal(first.ate, 10);
  assert.equal(s.p.tx, 12);
  assert.equal(pxAtEat >> 3, 12);
  assert.equal(s.p.pause, 1);
  const px = s.p.px;
  const r = s.p.tick(s.m, LEFT, 100);
  assert.deepEqual(r, { moved: 0, ate: 0 });
  assert.equal(s.p.px, px);
});

test('50 for an energizer, pause 3', () => {
  const s = setup();
  s.p.px = 28; s.p.py = 188; s.p.dir = LEFT;
  s.p.tx = 3; s.p.ty = 23;
  s.m.eat(2, 23);
  let r;
  for (let i = 0; i < 20; i++) {
    r = s.p.tick(s.m, LEFT, 100);
    if (s.p.tx === 1) break;
  }
  assert.equal(s.p.tx, 1);
  assert.equal(s.m.dotAt(1, 23), 0);
  assert.equal(s.p.pause, 3);
  assert.equal(r.ate, 50);
});

test('anim counts pixels', () => {
  const s = setup();
  let px = 0;
  for (const r of frames(s, LEFT, 30)) px += r.moved;
  assert.equal(s.p.anim, px);
  assert.equal(112 - s.p.px, px);
});

test('wraps through the tunnel', () => {
  const s = setup();
  s.p.px = 4; s.p.py = 116; s.p.tx = 0; s.p.ty = 14; s.p.dir = LEFT;
  s.p.tick(s.m, LEFT, 100);
  assert.equal(s.p.px, 3);
  s.p.px = 0;
  s.p.tx = 0;
  s.p.tick(s.m, LEFT, 100);
  assert.equal(s.p.px, 223);
  assert.equal(s.p.tx, 27);
});
