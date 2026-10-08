import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, START_FRAMES } from '../../tools/games/!Pacman/Game';
import { SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { LEFT, RIGHT, UP } from '../../tools/games/!Pacman/Dirs';
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
  g.modes.mode = 'chase';   // in scatter he heads for his corner
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
  assert.equal(s.ghosts.length, 4);
  assert.equal(s.modes.mode, 'scatter');
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

test('a mode change reverses every active ghost, and only them', () => {
  const g = playing();
  g.player.pause = 1e9;
  g.player.tx = g.player.ty = -9;
  g.ghosts[1].state = 'house';
  g.ghosts[1].py = 116;
  g.debug.place(0, 101, 92, LEFT);
  g.modes.timer = 418;              // two frames to the change
  g.tick({ want: -1 });
  assert.equal(g.modes.mode, 'scatter');
  const ev = g.tick({ want: -1 });
  assert.ok(ev.some((e) => e.type === 'modeChange'));
  assert.equal(g.modes.mode, 'chase');
  assert.equal(g.ghosts[0].reverse, true);
  assert.equal(g.ghosts[3].state, 'house');
  assert.equal(g.ghosts[3].reverse, false);
});

test('scatter aims at the corner, chase at chaseTarget', () => {
  const g = playing();
  g.player.pause = 1e9;
  const seen = [];
  const b = g.ghosts[0], orig = b.tick.bind(b);
  b.tick = (c) => { seen.push(c.target); return orig(c); };
  g.tick({ want: -1 });
  assert.deepEqual(seen[0], SPECIAL.scatter[0]);
  g.modes.timer = 419;
  g.tick({ want: -1 });
  g.tick({ want: -1 });
  assert.deepEqual(seen.at(-1), [g.player.tx, g.player.ty]);
});

/** A game with Pac-Man a few pixels below an energizer. */
function nearEnergizer() {
  const g = playing();
  assert.equal(g.maze.dotAt(1, 3), 50);
  Object.assign(g.player, { px: 12, py: 38, tx: 1, ty: 4, dir: UP });
  return g;
}

test('an energizer turns every ghost blue and turns active ones', () => {
  const g = nearEnergizer();
  g.ghosts[3].state = 'house';
  const ev = run(g, [[UP, 14]]);
  const types = ev.map((e) => e.type);
  assert.ok(types.includes('energizer'));
  assert.ok(types.includes('frightStart'));
  assert.ok(g.fright.on);
  assert.ok(g.ghosts.every((x) => x.blue), 'all blue');
  assert.equal(g.ghosts[3].state, 'house');
});

test('active ghosts reverse when the fright starts', () => {
  const g = nearEnergizer();
  g.debug.place(0, 100, 92, LEFT);
  let ev = [];
  while (!ev.some((e) => e.type === 'frightStart')) ev = g.tick({ want: UP });
  assert.equal(g.ghosts[0].reverse, true);
});

test('the Modes timer is frozen during a fright, and it ends', () => {
  const g = nearEnergizer();
  g.player.pause = 0;
  run(g, [[UP, 14]]);
  assert.ok(g.fright.on);
  const t = g.modes.timer;
  g.player.pause = 1e9;
  g.player.tx = g.player.ty = -9;    // out of any ghost's way
  const ev = run(g, [[-1, 100]]);
  assert.equal(g.modes.timer, t);
  assert.equal(ev.some((e) => e.type === 'frightEnd'), false);
  const rest = run(g, [[-1, 400]]);
  assert.equal(rest.filter((e) => e.type === 'frightEnd').length, 1);
  assert.equal(g.fright.on, false);
  assert.ok(g.ghosts.every((x) => !x.blue));
  assert.ok(g.modes.timer > t);
});

test('blue ghosts outside choose with the game rng', () => {
  const g = nearEnergizer();
  run(g, [[UP, 14]]);
  g.player.pause = 1e9;
  g.debug.place(0, 100, 92, LEFT);
  g.ghosts[0].blue = true;
  const before = g.rng.s;
  run(g, [[-1, 30]]);
  assert.notEqual(g.rng.s, before);
});

test('a ghost leaving the house is still blue', () => {
  const g = nearEnergizer();
  run(g, [[UP, 14]]);
  g.player.pause = 1e9;
  g.ghosts[1].leave();
  run(g, [[-1, 120]]);
  assert.equal(g.ghosts[1].state, 'active');
  assert.equal(g.ghosts[1].blue, true);
});
