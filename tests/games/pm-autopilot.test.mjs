import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Rng } from '../../tools/games/!GameLib/Maths';
import { Keys } from '../../tools/games/!GameLib/Keys';
import { Surface, rgb } from '../../tools/games/!GameLib/Surface';
import { drawText } from '../../tools/games/!GameLib/Font';
import { Game } from '../../tools/games/!Pacman/Game';
import { Autopilot } from '../../tools/games/!Pacman/Autopilot';
import { drawHud } from '../../tools/games/!Pacman/Hud';
import { COLOURS } from '../../tools/games/!Pacman/Theme';
import { DX, DY, LEFT, RIGHT, UP, DOWN } from '../../tools/games/!Pacman/Dirs';
import { loopFor } from '../../tools/games/!Pacman/SoundMap';
import { Screens, ACTIONS } from '../../tools/games/!Pacman/Screens';
import { DEFAULTS } from '../../tools/games/!Pacman/Settings';
import { SEED } from '../../tools/games/!Pacman/Scores';

/** A demo game and its autopilot, both from one seed. */
function demo(seed) {
  return { game: new Game({ demo: true, seed }),
    pilot: new Autopilot(new Rng(seed)) };
}

/** One tick as the shell does it: the autopilot's want in play. */
function step(game, pilot) {
  const want = game.state === 'play' ? pilot.drive(game) : -1;
  game.tick({ want });
  return want;
}

const hash = (game) => createHash('sha256')
  .update(JSON.stringify(game.snapshot())).digest('hex');

test('a demo game: one life, no bonus, 60 ticks of start', () => {
  const g = new Game({ demo: true, seed: 1 });
  assert.equal(g.demo, true);
  assert.equal(g.lives, 0);          // no spare life
  assert.equal(g.bonus, 0);
  assert.equal(g.actorsShown, true); // from tick 0
  assert.equal(g.state, 'start');
  for (let i = 0; i < 59; i++) g.tick({ want: -1 });
  assert.equal(g.state, 'start');
  assert.deepEqual(g.events, []);    // no jingle event either
  g.tick({ want: -1 });
  assert.equal(g.state, 'play');
  assert.equal(g.frame, 60);
});

test('a normal game still shows its actors after 120 ticks', () => {
  const g = new Game({ seed: 1 });
  assert.equal(g.actorsShown, false);
  assert.equal(g.lives, 3);
});

test('a demo gets no extra life at 10000', () => {
  const g = new Game({ demo: true, seed: 1, bonus: 10000 });
  g.debug.skipIntro();
  g.score = 9990;
  const p = g.player;       // one dot ahead of him, in the next tile
  g.maze.dots[p.ty * g.maze.w + p.tx - 1] = 10;
  const events = [];
  for (let i = 0; i < 40; i++) events.push(...g.tick({ want: LEFT }));
  assert.ok(g.score >= 10000, 'score ' + g.score);
  assert.equal(g.lives, 0);
  assert.ok(!events.some((e) => e.type === 'extraLife'));
  const n = new Game({ seed: 1 });         // a normal game does
  n.debug.skipIntro();
  n.score = 9990;
  const q = n.player, ev = [];
  n.maze.dots[q.ty * n.maze.w + q.tx - 1] = 10;
  for (let i = 0; i < 40; i++) ev.push(...n.tick({ want: LEFT }));
  assert.ok(ev.some((e) => e.type === 'extraLife'));
});

test('the Hud shows DEMO where GAME OVER would be', () => {
  const lit = (g) => {
    const s = new Surface(224, 288);
    drawHud(s, g, 0, 0);
    return s;
  };
  const text = (t) => {
    const s = new Surface(224, 288);
    drawText(s, t, 112, 160, { align: 'centre',
      colour: rgb(...COLOURS.over) });
    return s;
  };
  const same = (a, b) => {
    let n = 0;
    for (let y = 160; y < 168; y++) {
      for (let x = 60; x < 164; x++) {
        if (b.get(x, y)) { n++; assert.equal(a.get(x, y), b.get(x, y)); }
      }
    }
    return n;
  };
  for (const state of ['gameOver', 'over']) {
    const g = new Game({ demo: true, seed: 1 });
    g.setState(state);
    assert.ok(same(lit(g), text('DEMO')) > 20, state);
    const h = new Game({ seed: 1 });
    h.setState(state);
    assert.ok(same(lit(h), text('GAME OVER')) > 20, state);
    let differ = 0;
    for (let x = 60; x < 164; x++) {
      if (lit(h).get(x, 163) !== text('DEMO').get(x, 163)) differ++;
    }
    assert.ok(differ > 0, 'GAME OVER is not DEMO');
  }
});

test('want is always -1 or an open direction (20 seeds)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { game, pilot } = demo(seed);
    for (let t = 0; t < 3600 && game.state !== 'over'; t++) {
      const play = game.state === 'play';
      const want = step(game, pilot);
      if (!play) continue;
      assert.ok(want >= -1 && want <= 3, `seed ${seed} tick ${t}`);
      if (want >= 0) {
        const p = game.player;
        const wasOpen = game.maze.walkable(p.tx + DX[want],
          p.ty + DY[want], 'pac');
        // the want was decided at the centre of an earlier tile; it
        // is open from the tile it was chosen in. Check at decision.
        if (pilot.last === p.ty * game.maze.w + p.tx) {
          assert.ok(wasOpen, `seed ${seed} tick ${t}: ${want}`);
        }
      }
    }
  }
});

test('a decision is always legal from its own tile', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { game, pilot } = demo(seed);
    let last = null, decisions = 0;
    const orig = pilot.choose.bind(pilot);
    pilot.choose = (g) => {
      const d = orig(g);
      decisions++;
      const p = g.player;
      assert.ok(d === -1 || g.maze.walkable(p.tx + DX[d], p.ty + DY[d],
        'pac'), `seed ${seed}: ${d} at ${p.tx},${p.ty}`);
      last = d;
      return d;
    };
    for (let t = 0; t < 3600 && game.state !== 'over'; t++) {
      step(game, pilot);
    }
    assert.ok(decisions > 50 && last !== null, `seed ${seed}`);
  }
});

test('deterministic: two runs of a seed agree after 3000 ticks', () => {
  const run = (seed) => {
    const { game, pilot } = demo(seed);
    for (let t = 0; t < 3000; t++) step(game, pilot);
    return hash(game);
  };
  assert.equal(run(5), run(5));
  assert.notEqual(run(5), run(6));
});

// Golden: seed 1 demo after 3000 ticks. A change to this hash must
// be explained in the commit message that makes it.
test('golden: demo seed 1 after 3000 ticks', () => {
  const { game, pilot } = demo(1);
  for (let t = 0; t < 3000; t++) step(game, pilot);
  assert.equal(hash(game), '5b05987c4a8ec78d23106ba24bca34f832197684009fe82ce4860216c8f0449d');
});

/** Run a demo to 'over' or max ticks. */
function life(seed, max = 3600) {
  const { game, pilot } = demo(seed);
  let play = 0, t = 0;
  for (; t < max && game.state !== 'over'; t++) {
    if (game.state === 'play') play++;
    step(game, pilot);
  }
  return { game, play, t };
}

test('across seeds 1-20 a demo lasts and eats', () => {
  const rows = [];
  let rich = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { game, play, t } = life(seed);
    rows.push(`${seed}:${play}/${game.maze.dotsEaten}/${game.level}`);
    assert.ok(play >= 1200, `seed ${seed} played only ${play}`);
    if (game.maze.dotsEaten + (game.level - 1) * 244 >= 100) rich++;
  }
  console.log('seed:play/dots/level ' + rows.join(' '));
  assert.ok(rich >= 10, `${rich} seeds ate 100 dots`);
});

test('a 3600 tick demo is fast', () => {
  const t0 = process.hrtime.bigint();
  life(3);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 2000, ms + ' ms');
});

// ---- the policy, on placed positions ----

const at = (tx) => tx * 8 + 4;

/** A quiet game in play: ghosts shut in the house, no dots. */
function quiet(dots = [], pac = [12, 5], dir = RIGHT) {
  const g = new Game({ demo: true, seed: 1 });
  g.debug.skipIntro();
  g.debug.clearLevel();
  for (const o of g.ghosts) o.state = 'house';
  for (const [x, y, v] of dots) g.maze.dots[y * g.maze.w + x] = v || 10;
  const p = g.player;
  [p.tx, p.ty, p.px, p.py, p.dir] =
    [pac[0], pac[1], at(pac[0]), at(pac[1]), dir];
  return g;
}

const ghostAt = (g, id, x, y, dir = RIGHT) =>
  g.debug.place(id, at(x), at(y), dir);

/** Steps along the maze between two tiles (an independent search). */
function steps(maze, a, b) {
  const seen = new Map([[a.join(), 0]]);
  const q = [a];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === b[0] && y === b[1]) return seen.get(b.join());
    for (const d of maze.exits(x, y)) {
      let nx = x + DX[d];
      if (y === maze.special.tunnelRow) nx = (nx + maze.w) % maze.w;
      const k = [nx, y + DY[d]];
      if (!seen.has(k.join())) {
        seen.set(k.join(), seen.get([x, y].join()) + 1);
        q.push(k);
      }
    }
  }
  return Infinity;
}

const nbr = (g, d) => [g.player.tx + DX[d], g.player.ty + DY[d]];

test('flee: a ghost 3 steps away, take the farthest neighbour', () => {
  const g = quiet([[1, 29]]);
  ghostAt(g, 0, 9, 5);
  assert.equal(steps(g.maze, [9, 5], [12, 5]), 3);
  const pilot = new Autopilot(new Rng(1));
  const d = pilot.choose(g);
  const far = (e) => steps(g.maze, [9, 5], nbr(g, e));
  const best = Math.max(...g.maze.exits(12, 5).map(far));
  assert.equal(far(d), best);
  assert.notEqual(d, LEFT);
});

test('flee: not into a pocket the ghost closes first', () => {
  // At (12,4) he can go up the column to row 1, or down to row 5.
  // Up is farther from the ghost at (9,5) (5 steps against 3), but
  // row 1 leads into (6,1), which the ghost reaches before he could:
  // a pocket. So he goes down, where the whole of row 5 is open.
  const g = quiet([[1, 29]], [12, 4], LEFT);
  ghostAt(g, 0, 9, 5);
  const far = (e) => steps(g.maze, [9, 5], nbr(g, e));
  assert.deepEqual(g.maze.exits(12, 4), [UP, DOWN]);
  assert.ok(far(UP) > far(DOWN));
  assert.equal(new Autopilot(new Rng(1)).choose(g), DOWN);
});

test('blue ghost within the fright left: go for it', () => {
  const g = quiet([[1, 29]]);
  ghostAt(g, 1, 17, 5, LEFT);
  g.ghosts[1].blue = true;
  g.fright.start();
  g.fright.elapsed = 100;
  const pilot = new Autopilot(new Rng(1));
  assert.equal(pilot.choose(g), RIGHT);
  g.fright.elapsed = g.fright.frames - 10;   // too late
  assert.notEqual(new Autopilot(new Rng(1)).choose(g), RIGHT);
});

test('energizer: a ghost within 10 and the energizer nearer to him', () => {
  const g = quiet([[1, 3, 50], [26, 29]], [3, 5], LEFT);
  ghostAt(g, 0, 12, 5, LEFT);
  assert.ok(steps(g.maze, [12, 5], [3, 5]) <= 10);
  g.player.dir = UP;
  const d = new Autopilot(new Rng(1)).choose(g);
  assert.equal(d, LEFT);
  // without the ghost near, the nearest dot is the energizer too, so
  // put a nearer dot the other way: he still heads for the energizer
  g.maze.dots[5 * g.maze.w + 5] = 10;
  assert.equal(new Autopilot(new Rng(1)).choose(g), LEFT);
});

test('nearest dot by search, keeping his way on a tie', () => {
  const g = quiet([[10, 5], [18, 5]], [14, 5], RIGHT);
  const pilot = new Autopilot(new Rng(1));
  assert.equal(pilot.choose(g), RIGHT);
  g.player.dir = LEFT;
  assert.equal(pilot.choose(g), LEFT);
  g.player.dir = UP;
  assert.ok([LEFT, RIGHT].includes(pilot.choose(g)));
  g.maze.dots[5 * g.maze.w + 18] = 0;
  g.maze.dots[5 * g.maze.w + 20] = 10;
  g.player.dir = RIGHT;
  assert.equal(pilot.choose(g), LEFT);   // 4 away against 6
});

test('the tunnel counts: the dot across the wrap is nearer', () => {
  const g = quiet([[27, 14]], [2, 14], LEFT);
  g.player.dir = UP;
  assert.equal(new Autopilot(new Rng(1)).choose(g), LEFT);
});

// ---- the demo is silent and never recorded ----

test('a demo is silent and never saves a score', () => {
  const keys = new Keys(ACTIONS);
  const log = [];
  const app = { keys, settings: { ...DEFAULTS },
    scores: { table: SEED.map((e) => ({ ...e })), lastName: '' },
    saveScores: () => log.push('save'), changeSetting() {},
    toggleBrowserFull() {}, toDesktop() {}, viewSource() {},
    seed: () => 7 };
  const screens = new Screens(app);
  keys.keyDown({ code: 'Enter' });
  screens.frame(keys.takePresses());
  keys.keyUp({ code: 'Enter' });
  const { game, pilot } = demo(2);
  game.score = 99999;
  screens.game = game;
  let loops = 0;
  for (let t = 0; t < 5000 && game.state !== 'over'; t++) {
    if (t === 600) game.debug.kill();   // the demo ends with a death
    step(game, pilot);
    if (loopFor(game)) loops++;
  }
  assert.equal(game.state, 'over');
  assert.equal(loops, 0);
  for (let i = 0; i < 400 && screens.name === 'play'; i++) screens.tick();
  assert.equal(screens.name, 'title');
  assert.deepEqual(log, []);
});
