import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, START_FRAMES } from '../../tools/games/!Pacman/Game';
import { SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { LEFT, RIGHT, UP, DOWN, DX, DY } from '../../tools/games/!Pacman/Dirs';
import { playing, run } from './script.mjs';
import { addScore, ghostPct, pacPct, targetOf } from '../../tools/games/!Pacman/Play';
import { chaseTarget } from '../../tools/games/!Pacman/Targets';
import { levelSpec } from '../../tools/games/!Pacman/Levels';

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
  run(g, [[LEFT, 210]]);                // the death sequence
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
  assert.equal(g.state, 'dying');
  for (let i = 0; i < 210; i++) g.tick({ want: -1 });
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
  assert.equal(g.state, 'dying');
  run(g, [[LEFT, 210]]);
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

// ---- Task 15: levels, level complete, fruit ----

test('fright uses the level table: 6 s then 2 s', () => {
  assert.equal(playing().fright.frames, 360);
  assert.equal(playing({ level: 5 }).fright.frames, 120);
  assert.equal(playing({ level: 9 }).fright.flashes, 3);
});

for (const level of [17, 19, 21, 30]) {
  test(`level ${level}: energizer reverses ghosts, nobody turns blue`,
    () => {
      const g = playing({ level });
      Object.assign(g.player, { px: 12, py: 38, tx: 1, ty: 4, dir: UP });
      g.debug.place(0, 100, 92, LEFT);
      g.ghosts[3].state = 'house';
      let ev = [];
      while (!ev.some((e) => e.type === 'frightStart')) {
        ev = g.tick({ want: UP });
      }
      assert.equal(g.fright.on, false);
      assert.ok(g.ghosts.every((x) => !x.blue), 'none blue');
      assert.equal(g.ghosts[0].reverse, true);
      assert.equal(g.score, 50);
      const rest = run(g, [[-1, 600]]);
      assert.ok(!rest.some((e) => e.type === 'frightEnd'));
      assert.ok(g.ghosts.every((x) => !x.blue && !x.flash));
    });
}

/** Clear the level and run the sequence, noting what is seen. */
function levelDone(g) {
  g.debug.clearLevel();
  const seen = [];
  const ev = [];
  for (let i = 0; i < 241; i++) {
    ev.push(...g.tick({ want: -1 }));
    seen.push([g.state, g.stateTimer]);
  }
  return { seen, ev };
}

test('clearing the level: levelDone for 240 frames, then ready', () => {
  const g = playing();
  g.debug.clearLevel();
  assert.equal(g.maze.dotsLeft, 0);
  const first = g.tick({ want: -1 });
  assert.deepEqual(first.filter((e) => e.type === 'levelDone'),
    [{ type: 'levelDone' }]);
  assert.equal(g.state, 'levelDone');
  assert.equal(g.level, 1);
  for (let i = 0; i < 239; i++) g.tick({ want: -1 });
  assert.equal(g.state, 'levelDone');
  g.tick({ want: -1 });
  assert.equal(g.state, 'ready');
  assert.equal(g.level, 2);
  assert.equal(g.maze.dotsLeft, 244);
  assert.equal(g.maze.dotsEaten, 0);
  for (let i = 0; i < 119; i++) g.tick({ want: -1 });
  assert.equal(g.state, 'ready');
  g.tick({ want: -1 });
  assert.equal(g.state, 'play');
});

test('the new level starts clean and uses its own table', () => {
  const g = playing();
  g.sweeps = 3;
  g.eatenId = 2;
  g.popups = [{ px: 1, py: 1, text: '200', frames: 50 }];
  g.fright.start();
  g.house.counts[2] = 9;
  g.ghosts[1].blue = true;
  levelDone(g);
  assert.equal(g.sweeps, 0);
  assert.equal(g.eatenId, -1);
  assert.deepEqual(g.popups, []);
  assert.equal(g.fright.on, false);
  assert.equal(g.fright.frames, 300);
  assert.deepEqual(g.house.limits, [0, 0, 0, 50]);
  assert.equal(g.house.counts[2], 0);
  assert.equal(g.modes.list[0], 420);
  assert.equal(g.modes.mode, 'scatter');
  assert.equal(g.fruit.shown, false);
  assert.ok(g.ghosts.every((x) => !x.blue));
  assert.equal(g.player.px, SPECIAL.starts.pac.px);
});

test('a new level resets the 12000 sweeps', () => {
  const g = playing();
  g.sweeps = 3;
  levelDone(g);
  g.sweeps = 0;
  g.debug.skipIntro();
  assert.equal(g.sweeps, 0);
});

test('levelDone counts stateTimer 0 to 239 and the ghosts stay put', () => {
  const g = playing();
  g.debug.clearLevel();
  g.tick({ want: -1 });
  const at = g.ghosts.map((x) => [x.px, x.py]);
  const timers = [g.stateTimer];
  for (let i = 1; i < 240; i++) {
    g.tick({ want: -1 });
    timers.push(g.stateTimer);
    assert.equal(g.state, i < 240 ? 'levelDone' : 'ready');
  }
  assert.deepEqual(timers, Array.from({ length: 240 }, (_, i) => i));
  assert.deepEqual(g.ghosts.map((x) => [x.px, x.py]), at);
});

test('a level 17 clear goes to level 18, and so on', () => {
  const g = playing({ level: 17 });
  levelDone(g);
  assert.equal(g.level, 18);
  assert.equal(g.fright.frames, 60);
});

/** Pac-Man one pixel from the fruit's tile, going left. */
function atFruit() {
  const g = playing();
  Object.assign(g.player, { px: 112, py: 140, tx: 14, ty: 17,
    dir: LEFT, pause: 0 });
  return g;
}

test('the fruit appears at 70 dots, is eaten for its points', () => {
  const g = atFruit();
  g.fruit.onDots(70);
  assert.equal(g.fruit.shown, true);
  const s0 = g.score;
  const ev = g.tick({ want: LEFT });
  const e = ev.find((x) => x.type === 'fruitEaten');
  assert.ok(e, 'event');
  assert.deepEqual([e.kind, e.points], ['cherries', 100]);
  assert.equal(g.score - s0, 100);
  assert.equal(g.fruit.shown, false);
  assert.deepEqual(g.popups.map((p) => [p.px, p.py, p.text, p.frames]),
    [[112, 140, '100', 120]]);
  for (let i = 0; i < 119; i++) g.tick({ want: -1 });
  assert.equal(g.popups.length, 1);
  g.tick({ want: -1 });
  assert.equal(g.popups.length, 0);
});

test('the fruit shows when the 70th dot is eaten, by itself', () => {
  const g = playing();
  const row = g.player.ty;
  let tx = 0;
  for (let x = 0; x < g.maze.w; x++) {
    if (x < 13 && g.maze.dotAt(x, row) === 10) tx = x;
  }
  for (let y = 0; y < g.maze.h && g.maze.dotsEaten < 69; y++) {
    for (let x = 0; x < g.maze.w && g.maze.dotsEaten < 69; x++) {
      if (g.maze.dotAt(x, y) === 10 && !(y === row && x === tx)) {
        g.maze.eat(x, y);
      }
    }
  }
  assert.equal(g.maze.dotsEaten, 69);
  assert.equal(g.fruit.shown, false);
  run(g, [[LEFT, 200]]);
  assert.ok(g.maze.dotsEaten >= 70);
  assert.equal(g.fruit.shown, true);
});

test('a missed fruit goes away and a death removes it', () => {
  const g = playing();
  g.fruit.onDots(70);
  const t = g.fruit.timer;
  g.player.pause = 1e9;
  for (let i = 0; i < t; i++) g.tick({ want: -1 });
  assert.equal(g.fruit.shown, false);
  g.fruit.onDots(170);
  assert.equal(g.fruit.shown, true);
  g.debug.kill();
  assert.equal(g.fruit.shown, false);
});

test('the fruit follows the level', () => {
  const g = playing({ level: 9 });
  g.fruit.onDots(170);
  assert.deepEqual([g.fruit.kind, g.fruit.points], ['rocket', 2000]);
});

const idle = { want: -1 };
const ticks = (g, n) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...g.tick(idle)); return ev; };

test('start: 252 frames, actors and the first life at frame 120', () => {
  const g = new Game({ seed: 1 });
  assert.equal(g.actorsShown, false);
  const first = g.tick(idle);
  assert.deepEqual(first, [{ type: 'start' }]);
  ticks(g, 118);                                  // 119 ticks
  assert.deepEqual([g.actorsShown, g.lives], [false, 3]);
  g.tick(idle);                                   // 120
  assert.deepEqual([g.actorsShown, g.lives], [true, 2]);
  ticks(g, 131);                                  // 251
  assert.equal(g.state, 'start');
  g.tick(idle);
  assert.equal(g.state, 'play');
  assert.equal(g.lives, 2);
  assert.equal(g.actorsShown, true);
});

test('death: freeze, vanish, 11 frame animation, pause, ready', () => {
  const g = playing();
  untilDots(g, 5);
  const eaten = g.maze.dotsEaten, score = g.score;
  g.fruit.onDots(70);
  g.popups.push({ px: 112, py: 100, text: '100', frames: 90 });
  g.eatenId = 2;
  assert.equal(g.lives, 2);
  g.events = [];
  g.debug.kill();
  assert.deepEqual(g.events, [{ type: 'death' }]);
  assert.equal(g.state, 'dying');
  assert.deepEqual(g.popups, []);
  assert.equal(g.fruit.shown, false);
  assert.equal(g.eatenId, -1);
  const px = g.player.px, bx = g.ghosts[0].px;
  const seen = [];
  for (let t = 1; t <= 209; t++) {
    g.tick(idle);
    assert.equal(g.state, 'dying', 'tick ' + t);
    assert.equal(g.stateTimer, t);
    seen.push(g.deathFrame);
    assert.equal(g.ghostsShown, t < 60, 'ghosts at ' + t);
  }
  assert.equal(g.player.px, px);
  assert.equal(g.ghosts[0].px, bx);           // frozen, not reset yet
  assert.deepEqual([seen[58], seen[59], seen[148], seen[208]],
    [-1, 0, 10, 10]);                     // ticks 59, 60, 149, 209
  assert.deepEqual([...new Set(seen)], [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(g.lives, 2);
  const evs = g.tick(idle);                   // the 210th
  assert.deepEqual(evs, [{ type: 'ready' }]);
  assert.equal(g.state, 'ready');
  assert.equal(g.lives, 1);
  assert.equal(g.maze.dotsEaten, eaten);
  assert.equal(g.score, score);
  assert.equal(g.house.global, true);
  assert.equal(g.modes.timer, 0);
  assert.equal(g.modes.phase, 0);
  assert.equal(g.fruit.shown, false);
  assert.equal(g.actorsShown, true);
  ticks(g, 119);
  assert.equal(g.state, 'ready');
  g.tick(idle);
  assert.equal(g.state, 'play');
});

test('death animation: frame k lasts 90/11 ticks from tick 60', () => {
  const g = playing();
  g.debug.kill();
  const at = {};
  for (let t = 1; t <= 150; t++) { g.tick(idle); at[t] = g.deathFrame; }
  assert.equal(at[59], -1);
  assert.equal(at[60], 0);
  assert.equal(at[68], 0);
  assert.equal(at[69], 1);
  assert.equal(at[149], 10);
});

test('the last life: gameOver for 180 frames, then over for good', () => {
  const g = playing({ lives: 1 });
  assert.equal(g.lives, 0);
  g.debug.kill();
  ticks(g, 209);
  assert.equal(g.state, 'dying');
  const ev = g.tick(idle);
  assert.deepEqual(ev, [{ type: 'gameOver' }]);
  assert.equal(g.state, 'gameOver');
  assert.equal(g.lives, 0);
  ticks(g, 179);
  assert.equal(g.state, 'gameOver');
  g.tick(idle);
  assert.equal(g.state, 'over');
  const snap = JSON.stringify(g.snapshot());
  assert.deepEqual(ticks(g, 50), []);
  assert.equal(JSON.stringify(g.snapshot()), snap);
});

test('a death with lives to spare is not game over', () => {
  const g = playing({ lives: 2 });
  g.debug.kill();
  ticks(g, 210);
  assert.equal(g.state, 'ready');
  assert.equal(g.lives, 0);
  g.debug.skipIntro();
  g.debug.kill();
  ticks(g, 210);
  assert.equal(g.state, 'gameOver');
});

test('extra life: once at 10000, not again at 20000', () => {
  const g = playing();
  g.score = 9990;
  const ev = [];
  g.events = ev;
  addScore(g, 10);
  assert.deepEqual(ev, [{ type: 'extraLife' }]);
  assert.equal(g.lives, 3);
  addScore(g, 10000);
  assert.equal(g.score, 20000);
  assert.equal(g.lives, 3);
  assert.equal(ev.length, 1);
});

test('extra life from a real dot', () => {
  const g = playing();
  g.score = 9990;
  g.player.pause = 0;
  const e = run(g, [[LEFT, 300]]);
  assert.equal(e.filter((x) => x.type === 'extraLife').length, 1);
  assert.equal(g.lives, 3);
});

test('extra life: bonus 0 never, 15000 at 15000 only', () => {
  const none = playing({ bonus: 0 });
  none.score = 9990;
  addScore(none, 100000);
  assert.equal(none.lives, 2);
  const g = playing({ bonus: 15000 });
  addScore(g, 10000);
  assert.equal(g.lives, 2);
  g.score = 14990;
  addScore(g, 10);
  assert.equal(g.lives, 3);
});

test('a big jump past the bonus is one life', () => {
  const g = playing();
  addScore(g, 12000);
  assert.equal(g.lives, 3);
});

/** Eat dots until n are left. */
function leave(g, n) {
  for (let y = 0; y < g.maze.h && g.maze.dotsLeft > n; y++) {
    for (let x = 0; x < g.maze.w && g.maze.dotsLeft > n; x++) {
      g.maze.eat(x, y);
    }
  }
  assert.equal(g.maze.dotsLeft, n);
}

test('Cruise Elroy 1: Blinky 75, 75, then 80 and 85', () => {
  const g = playing();
  const b = g.ghosts[0], s = levelSpec(1);
  assert.deepEqual([s.elroy1Dots, s.elroy1, s.elroy2Dots, s.elroy2],
    [20, 80, 10, 85]);
  assert.equal(ghostPct(g, b), 75);
  leave(g, 21);
  assert.equal(g.elroy, 0);
  assert.equal(ghostPct(g, b), 75);
  leave(g, 20);
  assert.equal(g.elroy, 1);
  assert.equal(ghostPct(g, b), 80);
  leave(g, 11);
  assert.equal(ghostPct(g, b), 80);
  leave(g, 10);
  assert.equal(g.elroy, 2);
  assert.equal(ghostPct(g, b), 85);
  assert.equal(ghostPct(g, g.ghosts[1]), 50);   // still in the house
  g.debug.place(1, 112, 188, LEFT);
  assert.equal(ghostPct(g, g.ghosts[1]), 75);   // out, no Elroy
});

test('in Elroy Blinky chases during scatter', () => {
  const g = playing();
  g.player.pause = 1e9;
  const b = g.ghosts[0];
  assert.equal(g.modes.mode, 'scatter');
  assert.deepEqual(targetOf(g, b), SPECIAL.scatter[0]);
  leave(g, 20);
  const want = chaseTarget(0, g.player, b, SPECIAL.scatter[0], b);
  assert.deepEqual(targetOf(g, b), want);
  assert.notDeepEqual(targetOf(g, b), SPECIAL.scatter[0]);
  assert.deepEqual(targetOf(g, g.ghosts[1]), SPECIAL.scatter[1]);
});

test('after a death Elroy is off until Clyde is out', () => {
  const g = playing();
  g.debug.kill();
  ticks(g, 330);
  assert.equal(g.state, 'play');
  leave(g, 15);
  assert.equal(g.elroy, 0);
  assert.equal(ghostPct(g, g.ghosts[0]), 75);
  assert.notEqual(g.ghosts[3].state, 'active');
  g.ghosts[3].state = 'active';
  g.tick(idle);
  assert.equal(g.elroy, 1);
  assert.equal(ghostPct(g, g.ghosts[0]), 80);
});

test('a new game or level resets what the last one left', () => {
  const g = playing();
  g.sweeps = 3;
  g.eatenId = 1;
  g.popups.push({ px: 1, py: 1, text: '1', frames: 9 });
  g.fruit.onDots(70);
  g.elroyOff = true;
  leave(g, 100);
  g.startLevel(1);
  assert.equal(g.maze.dotsEaten, 0);
  assert.deepEqual([g.sweeps, g.eatenId, g.popups.length, g.fruit.shown,
    g.elroyOff], [0, -1, 0, false, false]);
});

// ---- Task 17: per-level speeds, precedence, flash counts ----

/** Pixels ghost id moves in n ticks, Pac-Man parked out of the way. */
function ghostPixels(g, id, n) {
  g.player.pause = 1e9;
  g.player.tx = -99;
  g.house.tick = () => null;
  const gh = g.ghosts[id];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = gh.px, y = gh.py;
    g.tick(idle);
    const dx = Math.abs(gh.px - x);
    sum += Math.min(dx, 224 - dx) + Math.abs(gh.py - y);
  }
  return sum;
}
const wantPx = (pct, n) => Math.floor(pct * 12626 * n / 1e6);
const near = (got, pct, n, what) => assert.ok(
  Math.abs(got - wantPx(pct, n)) <= 1,
  what + ': ' + got + ' vs ' + wantPx(pct, n));

test('ghost speed precedence', () => {
  const at = (id, px, py, dir, setup) => {
    const g = playing();
    g.debug.place(id, px, py, dir);
    if (setup) setup(g, g.ghosts[id]);
    return g;
  };
  let g = at(1, 112, 188, LEFT, (_, x) => x.eat());
  near(ghostPixels(g, 1, 30), 200, 30, 'eyes');
  assert.equal(ghostPct(g, g.ghosts[1]), 200);
  g = at(1, 44, 116, LEFT);
  assert.equal(ghostPct(g, g.ghosts[1]), 40);
  near(ghostPixels(g, 1, 120), 40, 120, 'tunnel');
  g = at(1, 112, 188, LEFT, (_, x) => { x.blue = true; });
  near(ghostPixels(g, 1, 600), 50, 600, 'blue');
  g = at(0, 112, 188, LEFT, (gg) => leave(gg, 10));
  assert.equal(g.elroy, 2);
  near(ghostPixels(g, 0, 600), 85, 600, 'Elroy 2');
  g = at(1, 112, 188, LEFT);
  near(ghostPixels(g, 1, 600), 75, 600, 'normal');
  g = playing();
  near(ghostPixels(g, 2, 600), 50, 600, 'house');
  assert.equal(g.ghosts[2].state, 'house');
});

test('speed precedence: blue beats Elroy, tunnel beats Elroy', () => {
  let g = playing();
  leave(g, 10);
  const b = g.ghosts[0];
  b.place(112, 188, LEFT);
  assert.equal(ghostPct(g, b), 85);
  b.blue = true;
  assert.equal(ghostPct(g, b), 50);
  near(ghostPixels(g, 0, 600), 50, 600, 'blue Elroy');
  b.blue = false;
  b.place(44, 116, LEFT);
  assert.equal(ghostPct(g, b), 40);
  near(ghostPixels(g, 0, 120), 40, 120, 'Elroy in the tunnel');
  b.blue = true;
  assert.equal(ghostPct(g, b), 40);       // the tunnel beats blue
  b.eat();
  assert.equal(ghostPct(g, b), 200);      // eyes beat everything
});

test('the ghosts follow the level table', () => {
  const g = playing({ level: 5 });
  g.debug.place(1, 112, 188, LEFT);
  assert.equal(ghostPct(g, g.ghosts[1]), 95);
  g.ghosts[1].blue = true;
  assert.equal(ghostPct(g, g.ghosts[1]), 60);
  g.debug.place(1, 44, 116, LEFT);
  assert.equal(ghostPct(g, g.ghosts[1]), 50);
});

/** Pixels Pac-Man moves in n ticks left along the tunnel row. */
function pacPixels(g, n) {
  g.player.px = 44; g.player.py = 116;
  g.player.tx = 5; g.player.ty = 14;
  g.player.dir = LEFT;
  g.house.tick = () => null;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = g.player.px;
    g.tick({ want: LEFT });
    sum += (x - g.player.px + 224) % 224;
  }
  return sum;
}

test('Pac-Man speed: normal, frightened, level 5 and 21', () => {
  let g = playing();
  assert.equal(pacPct(g), 80);
  g.fright.on = true;
  assert.equal(pacPct(g), 90);
  g = playing({ level: 5 });
  assert.equal(pacPct(g), 100);
  g = playing({ level: 21 });
  assert.equal(pacPct(g), 90);
  g.fright.on = true;                    // no fright speed: still 90
  assert.equal(pacPct(g), 90);
});

test('Pac-Man is not slowed in the tunnel', () => {
  near(pacPixels(playing(), 60), 80, 60, 'level 1');
  const g = playing();
  g.fright.on = true;
  near(pacPixels(g, 60), 90, 60, 'level 1 fright');
  near(pacPixels(playing({ level: 5 }), 60), 100, 60, 'level 5');
  near(pacPixels(playing({ level: 21 }), 60), 90, 60, 'level 21');
});

/** Ticks until ghost 0's flash shows white, each time it starts. */
function whiteStarts(level) {
  const g = playing({ level });
  g.player.pause = 1e9;
  g.player.tx = -99;
  g.fright.start();
  g.ghosts[0].blue = true;
  const starts = [];
  let was = false;
  for (let i = 0; i < 400 && g.fright.on; i++) {
    g.tick(idle);
    const f = g.ghosts[0].flash;
    if (f && !was) starts.push(i);
    was = f;
  }
  return starts;
}

test('flash counts: level 1 five flashes, level 9 from the start', () => {
  const a = whiteStarts(1);
  assert.equal(a.length, 5);
  assert.ok(a[0] >= 220 && a[0] <= 236, 'first ' + a[0]);
  const b = whiteStarts(9);
  assert.ok(b[0] <= 14, 'level 9 white from ' + b[0]);
  assert.equal(b.length, 2);             // 60 frames hold two whites
});
