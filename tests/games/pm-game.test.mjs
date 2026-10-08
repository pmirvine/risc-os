import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, START_FRAMES } from '../../tools/games/!Pacman/Game';
import { SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { LEFT, RIGHT, UP, DOWN, DX, DY } from '../../tools/games/!Pacman/Dirs';
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

/** A game with a stationary Pac-Man; blue ghost id put on him. */
function still() {
  const g = playing();
  g.player.pause = 1e9;
  return g;
}
function bluePlace(g, id) {
  const p = g.player;
  g.debug.place(id, p.px, p.py, LEFT);
  g.ghosts[id].blue = true;
}
const freeze = (g, n) => run(g, [[-1, n]]);

test('ghost chain: 200, 400, 800, 1600, each a 60 frame freeze', () => {
  const g = still();
  g.fright.start();
  const got = [];
  for (let id = 0; id < 4; id++) {
    const s0 = g.score;
    bluePlace(g, id);
    const ev = g.tick({ want: -1 });
    got.push(...ev.filter((e) => e.type === 'ghostEaten'));
    assert.equal(g.state, 'eaten');
    assert.deepEqual(g.popups.map((p) => [p.text, p.frames]),
      [[String(200 * 2 ** id), 60]]);
    assert.equal(g.popups[0].px, g.player.px);
    assert.equal(g.ghosts[id].state, 'eyes');
    assert.equal(g.ghosts[id].blue, false);
    freeze(g, 59);
    assert.equal(g.state, 'eaten');
    freeze(g, 1);
    assert.equal(g.state, 'play');
    assert.equal(g.popups.length, 0);
    assert.equal(g.score - s0, 200 * 2 ** id);
  }
  assert.deepEqual(got.map((e) => [e.id, e.points]),
    [[0, 200], [1, 400], [2, 800], [3, 1600]]);
});

test('during the freeze only eyes move, and Pac-Man waits', () => {
  const g = still();
  g.fright.start();
  bluePlace(g, 0);
  g.tick({ want: -1 });
  g.debug.place(1, 60, 44, RIGHT);
  g.ghosts[1].eat();
  g.ghosts[2].blue = true;
  const e1 = [g.ghosts[1].px, g.ghosts[1].py];
  const eaten = [g.ghosts[0].px, g.ghosts[0].py];
  const f = g.fright.elapsed;
  freeze(g, 10);
  assert.notDeepEqual([g.ghosts[1].px, g.ghosts[1].py], e1);
  assert.deepEqual([g.ghosts[0].px, g.ghosts[0].py], eaten);
  assert.equal(g.fright.elapsed, f);
});

test('12000 bonus once, after 4 ghosts on each of 4 energizers', () => {
  const g = still();
  let bonus = 0, ghosts = 0;
  for (let e = 0; e < 4; e++) {
    g.fright.start();
    for (let id = 0; id < 4; id++) {
      g.fright.on = true;
      bluePlace(g, id);
      const ev = g.tick({ want: -1 });
      ghosts += ev.filter((x) => x.type === 'ghostEaten').length;
      bonus += ev.filter((x) => x.type === 'bonus').length;
      const sc = g.score;
      if (ghosts === 15) assert.equal(bonus, 0);
      freeze(g, 60);
      assert.equal(g.score, sc);
    }
  }
  assert.equal(ghosts, 16);
  assert.equal(bonus, 1);
  assert.equal(g.score, 4 * 3000 + 12000);
});

test('three full sweeps give no bonus', () => {
  const g = still();
  for (let e = 0; e < 3; e++) {
    g.fright.start();
    for (let id = 0; id < 4; id++) {
      bluePlace(g, id);
      g.tick({ want: -1 });
      freeze(g, 60);
    }
  }
  assert.equal(g.score, 9000);
});

test('a revived ghost leaves the house not blue, the rest still are', () => {
  const g = still();
  g.fright.start();
  for (const x of g.ghosts) x.blue = true;
  g.player.tx = g.player.ty = -9;
  g.debug.place(2, 120, 92, LEFT);
  g.ghosts[2].blue = true;
  g.ghosts[2].eat();
  const others = [0, 1, 3];
  let left = false;
  for (let i = 0; i < 400 && !left; i++) {
    g.tick({ want: -1 });
    g.fright.elapsed = 0;       // keep the fright going
    if (g.ghosts[2].state === 'leaving') left = true;
  }
  assert.ok(left, 'revived');
  assert.equal(g.ghosts[2].blue, false);
  assert.ok(others.every((i) => g.ghosts[i].blue), 'others blue');
  run(g, [[-1, 120]]);
  assert.equal(g.ghosts[2].blue, false);
});

test('eyes steer for (13, 11) and ignore red zones', () => {
  const g = still();
  g.player.tx = g.player.ty = -9;
  g.debug.place(0, 60, 44, RIGHT);
  g.ghosts[0].eat();
  const seen = [], b = g.ghosts[0], orig = b.tick.bind(b);
  b.tick = (c) => { seen.push([c.target, c.redZones]); return orig(c); };
  g.tick({ want: -1 });
  assert.deepEqual(seen[0], [[13, 11], false]);
});

// ---- the ghost house (Task 14) ----

const states = (g) => g.ghosts.map((x) => x.state);

/** The way (0..3) towards the nearest dot from Pac-Man's tile. */
function toNearestDot(g) {
  const { player: p, maze: m } = g;
  const seen = new Set([p.tx + ',' + p.ty]);
  let q = [[p.tx, p.ty, -1]];
  while (q.length) {
    const next = [];
    for (const [x, y, first] of q) {
      for (const d of [UP, LEFT, DOWN, RIGHT]) {
        const nx = x + DX[d], ny = y + DY[d], k = nx + ',' + ny;
        if (seen.has(k) || !m.walkable(nx, ny, 'pac')) continue;
        seen.add(k);
        const f = first < 0 ? d : first;
        if (m.dotAt(nx, ny)) return f;
        next.push([nx, ny, f]);
      }
    }
    q = next;
  }
  return -1;
}

/** Eat n more dots (or energizers), steering to the nearest one, and
 *  keeping any active ghost out of Pac-Man's tile so that nothing
 *  ends the run. Returns the frames used. */
function untilDots(g, n) {
  let eaten = 0, t = 0;
  while (eaten < n) {
    for (const x of g.ghosts) {
      if (x.state === 'active' && Math.abs(x.tx - g.player.tx) +
        Math.abs(x.ty - g.player.ty) <= 2) {
        const far = g.player.tx < 14 ? 212 : 12;   // a far corner
        g.debug.place(x.id, far, 20, RIGHT);
      }
    }
    const ev = g.tick({ want: toNearestDot(g) });
    t++;
    assert.ok(!ev.some((e) => e.type === 'death'), 'no death ' +
      JSON.stringify([g.player.tx, g.player.ty, g.state,
        g.ghosts.map((x) => [x.state, x.tx, x.ty])]));
    eaten += ev.filter((e) => e.type === 'dot' ||
      e.type === 'energizer').length;
    assert.ok(t < 4000, 'too long');
  }
  return t;
}

test('Pinky leaves at once at level 1, Inky and Clyde wait', () => {
  const g = playing();
  g.tick({ want: -1 });
  assert.deepEqual(states(g), ['active', 'leaving', 'house', 'house']);
});

test('Inky leaves on the 30th dot, Clyde on his own 60th after', () => {
  const g = playing();
  untilDots(g, 29);
  assert.equal(g.ghosts[2].state, 'house');
  untilDots(g, 1);
  assert.equal(g.ghosts[2].state, 'leaving', '30th dot');
  assert.equal(g.house.counts[2], 30);
  assert.equal(g.ghosts[3].state, 'house');
  untilDots(g, 59);       // Clyde counts from the dot after Inky's
  assert.equal(g.ghosts[3].state, 'house');
  untilDots(g, 1);
  assert.equal(g.ghosts[3].state, 'leaving', 'his 60th dot');
  assert.equal(g.house.counts[3], 60);
});

test('there is no release timer: nothing at frame 240 but the idle', () => {
  const g = playing();
  g.player.pause = 1e9;
  g.player.tx = g.player.ty = -9;
  for (let t = 1; t <= 239; t++) {
    g.tick({ want: -1 });
    assert.equal(g.ghosts[2].state, 'house', 'frame ' + t);
  }
  g.tick({ want: -1 });
  assert.equal(g.ghosts[2].state, 'leaving', 'the idle timer, frame 240');
  assert.equal(g.ghosts[3].state, 'house');
  for (let t = 241; t <= 479; t++) g.tick({ want: -1 });
  assert.equal(g.ghosts[3].state, 'house');
  g.tick({ want: -1 });
  assert.equal(g.ghosts[3].state, 'leaving', 'idle again at 480');
});

test('a dot resets the idle timer', () => {
  const g = playing();
  g.player.pause = 1e9;
  g.player.tx = g.player.ty = -9;
  run(g, [[-1, 200]]);
  g.house.onDot();
  run(g, [[-1, 100]]);
  assert.equal(g.ghosts[2].state, 'house');
});

test('onLeft happens once, when the ghost reaches the exit', () => {
  const g = playing();
  g.player.pause = 1e9;
  g.player.tx = g.player.ty = -9;
  const calls = [], orig = g.house.onLeft.bind(g.house);
  g.house.onLeft = (id) => { calls.push([id, g.frame]); orig(id); };
  let exit = -1;
  for (let t = 0; t < 120; t++) {
    g.tick({ want: -1 });
    if (exit < 0 && g.ghosts[1].state === 'active') exit = g.frame;
  }
  assert.ok(exit > 0);
  assert.deepEqual(calls, [[1, exit]]);
  assert.deepEqual(g.house.waiting, [2, 3]);
});

test('a lost life: ready, ghosts back in the house, Pinky at 7 dots', () => {
  const g = playing();
  untilDots(g, 35);                  // Pinky, Inky out
  assert.equal(g.ghosts[2].state !== 'house', true);
  g.debug.kill();
  assert.equal(g.state, 'ready');
  assert.deepEqual(states(g), ['active', 'house', 'house', 'house']);
  assert.deepEqual(g.house.waiting, [1, 2, 3]);
  assert.equal(g.house.global, true);
  for (let i = 0; i < 119; i++) g.tick({ want: -1 });
  assert.equal(g.state, 'ready');
  g.tick({ want: -1 });
  assert.equal(g.state, 'play');
  untilDots(g, 6);
  assert.equal(g.ghosts[1].state, 'house');
  untilDots(g, 1);
  assert.equal(g.ghosts[1].state, 'leaving', '7th dot');
  assert.equal(g.ghosts[2].state, 'house');
  untilDots(g, 10);
  assert.equal(g.ghosts[2].state, 'leaving', '17th dot');
});

test('a ghost touching Pac-Man is a death into ready', () => {
  const g = playing();
  run(g, [[LEFT, 20]]);
  g.debug.place(0, g.player.px - 4, g.player.py, RIGHT);
  const ev = run(g, [[LEFT, 1]]);
  assert.ok(ev.some((e) => e.type === 'death'));
  assert.equal(g.state, 'ready');
  assert.equal(g.house.global, true);
});

test('revived eyes leave the house without disturbing the House', () => {
  const g = still();
  g.house.onRelease(1);
  g.house.onLeft(1);              // Pinky is out, as in a real game
  g.player.tx = g.player.ty = -9;
  g.debug.place(1, 120, 92, LEFT);
  g.ghosts[1].eat();
  const waiting = g.house.waiting.slice();
  let n = 0;
  while (g.ghosts[1].state !== 'active' && n++ < 600) {
    g.tick({ want: -1 });
    assert.ok(g.ghosts[1].state !== 'house');
  }
  assert.equal(g.ghosts[1].state, 'active');
  assert.equal(g.ghosts[1].blue, false);
  assert.deepEqual(g.house.waiting, waiting);
  assert.deepEqual(g.house.out, []);
});
