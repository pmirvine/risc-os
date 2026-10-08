import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, START_FRAMES } from '../../tools/games/!Pacman/Game';
import { SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { LEFT, RIGHT } from '../../tools/games/!Pacman/Dirs';
import { playing, run } from './script.mjs';

const dist = (g) => Math.abs(g.ghosts[0].tx - g.player.tx)
  + Math.abs(g.ghosts[0].ty - g.player.ty);

test('the intro lasts 252 frames, then play', () => {
  const g = new Game({ seed: 1 });
  assert.equal(START_FRAMES, 252);
  assert.equal(g.state, 'start');
  const first = g.tick({ want: -1 });
  assert.deepEqual(first, [{ type: 'start' }]);
  for (let i = 1; i < 251; i++) g.tick({ want: -1 });
  assert.equal(g.state, 'start');
  g.tick({ want: -1 });
  assert.equal(g.state, 'play');
  assert.equal(g.player.px, 112);
});

test('the options are kept', () => {
  const g = new Game({ seed: 3, level: 2, lives: 5, bonus: 20000 });
  assert.deepEqual([g.level, g.lives, g.bonus], [2, 5, 20000]);
  assert.equal(new Game({ demo: true }).lives, 1);
});

test('eating scores 10 a dot', () => {
  const g = playing();
  const ev = run(g, [[LEFT, 600]]);
  assert.ok(g.score > 0);
  assert.equal(g.maze.dotsEaten * 10, g.score);
  assert.ok(ev.some((e) => e.type === 'dot'));
});

test('Blinky closes in on Pac-Man', () => {
  const g = playing();
  const start = dist(g);
  const ev = run(g, [[LEFT, 140]]);
  assert.ok(!ev.some((e) => e.type === 'death'));
  assert.ok(dist(g) < start, dist(g) + ' vs ' + start);
});

test('sharing a tile is a death and everyone goes back', () => {
  const g = playing();
  run(g, [[LEFT, 20]]);
  const t = g.player;
  g.debug.place(0, t.px - 4, t.py, RIGHT);
  const ev = run(g, [[LEFT, 1]]);
  assert.ok(ev.some((e) => e.type === 'death'));
  const s = SPECIAL.starts;
  assert.deepEqual([g.player.px, g.player.py, g.player.dir],
    [s.pac.px, s.pac.py, s.pac.dir]);
  const b = g.ghosts[0];
  assert.deepEqual([b.px, b.py, b.dir],
    [s.ghosts[0].px, s.ghosts[0].py, s.ghosts[0].dir]);
});

test('the same seed plays the same game', () => {
  const a = playing({ seed: 5 }), b = playing({ seed: 5 });
  run(a, [[LEFT, 300]]);
  run(b, [[LEFT, 300]]);
  assert.deepEqual(a.snapshot(), b.snapshot());
  const s = a.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(s.ghosts.length, 1);
});

test('Blinky stays in the maze and never enters the house', () => {
  const g = playing();
  g.player.pause = 1e9;
  for (let i = 0; i < 2000; i++) {
    g.tick({ want: -1 });
    const b = g.ghosts[0];
    assert.ok(g.maze.walkable(b.tx, b.ty, 'ghost'), `${b.tx},${b.ty}`);
  }
});
