import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ghost } from '../../tools/games/!Pacman/Ghost';
import { Maze } from '../../tools/games/!Pacman/Maze';
import { ROWS, SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { UP, LEFT, RIGHT } from '../../tools/games/!Pacman/Dirs';
import { playing } from './script.mjs';

const maze = () => new Maze(ROWS, SPECIAL);
const ctx = (m, target = [1, 1]) => ({ maze: m, pct: 75, target,
  frightened: false, rng: null, redZones: true });

test('a reverse flag turns an active ghost at the next tile entry', () => {
  const m = maze(), g = new Ghost(0, SPECIAL.starts.ghosts[0]);
  g.place(60, 44, RIGHT);   // a corridor of row 5, heading right
  g.tick(ctx(m, [26, 5]));
  g.reverse = true;
  const tx = g.tx;
  let guard = 0;
  while (g.tx === tx && guard++ < 20) g.tick(ctx(m, [26, 5]));
  assert.equal(g.reverse, false);
  assert.equal(g.turn, LEFT);
  for (let i = 0; i < 8; i++) g.tick(ctx(m, [26, 5]));
  assert.equal(g.dir, LEFT);
});

test('two signals before a tile entry make one reversal', () => {
  const m = maze(), g = new Ghost(0, SPECIAL.starts.ghosts[0]);
  g.place(60, 44, RIGHT);
  g.tick(ctx(m, [26, 5]));
  g.reverse = true;
  g.reverse = true;
  const log = [];
  for (let i = 0; i < 40; i++) {
    g.tick(ctx(m, [26, 5]));
    log.push(g.dir);
  }
  const flips = log.filter((d, i) => i && d === (log[i - 1] ^ 2));
  assert.equal(flips.length, 1);
});

test('ghosts in the house bob 4 pixels either side of 116', () => {
  const g = new Ghost(1, SPECIAL.starts.ghosts[1]);
  assert.equal(g.state, 'house');
  const m = maze();
  let lo = 999, hi = 0;
  for (let i = 0; i < 400; i++) {
    g.tick(ctx(m));
    lo = Math.min(lo, g.py);
    hi = Math.max(hi, g.py);
    assert.equal(g.px, 112);
  }
  assert.deepEqual([lo, hi], [112, 120]);
});

test('house speed is 50%: 60 frames bob about 38 pixels', () => {
  const g = new Ghost(2, SPECIAL.starts.ghosts[2]);
  const m = maze();
  let moved = 0, last = g.py;
  for (let i = 0; i < 60; i++) {
    g.tick(ctx(m));
    moved += Math.abs(g.py - last);
    last = g.py;
  }
  assert.ok(moved >= 37 && moved <= 38, moved);
});

test('a leaving ghost goes to x 112, up to y 92, then left', () => {
  const m = maze();
  for (const id of [1, 2, 3]) {
    const g = new Ghost(id, SPECIAL.starts.ghosts[id]);
    g.leave();
    assert.equal(g.state, 'leaving');
    let xDone = -1, n = 0;
    while (g.state === 'leaving' && n++ < 400) {
      g.tick(ctx(m));
      if (xDone < 0 && g.px === 112) xDone = n;
      if (g.px !== 112) assert.ok(g.py >= 112, 'moved up before x 112');
    }
    assert.equal(g.state, 'active');
    assert.deepEqual([g.px, g.py, g.dir], [112, 92, LEFT]);
    for (let i = 0; i < 30; i++) g.tick(ctx(m, [1, 1]));
    assert.ok(g.px < 112, 'moves off to the left');
    assert.equal(g.py, 92);
  }
});

test('the temporary release: Pinky 0, Inky 240, Clyde 480', () => {
  const g = playing();
  const left = [-1, -1, -1, -1];
  g.player.pause = 1e9;
  g.player.tx = g.player.ty = -9;     // out of the way
  for (let t = 0; t < 600; t++) {
    g.tick({ want: -1 });
    g.ghosts.forEach((x, i) => {
      if (left[i] < 0 && x.state !== 'house') left[i] = t;
    });
  }
  assert.equal(left[0], 0);
  assert.equal(left[1], 0);
  assert.equal(left[2], 240);
  assert.equal(left[3], 480);
});

test('seeded game: ghosts reverse only after a mode change', () => {
  const g = playing({ seed: 4 });
  const prev = g.ghosts.map((x) => [x.dir, x.state]);
  let lastSwitch = -1, bad = [], flips = 0;
  const wants = [LEFT, UP, RIGHT, UP];
  for (let t = 0; t < 5000; t++) {
    const ev = g.tick({ want: wants[(t >> 6) & 3] });
    if (ev.some((e) => e.type === 'modeChange')) lastSwitch = t;
    if (ev.some((e) => e.type === 'death')) {
      prev.forEach((p, i) => { p[0] = -1; });
      lastSwitch = -1e9;
      continue;
    }
    g.ghosts.forEach((x, i) => {
      const [d, s] = prev[i];
      if (s === 'active' && x.state === 'active' && d >= 0
        && x.dir === (d ^ 2)) {
        flips++;
        if (t - lastSwitch > 24) bad.push([t, i]);
      }
      prev[i] = [x.dir, x.state];
    });
  }
  assert.deepEqual(bad, []);
  assert.ok(flips > 0, 'the mode changes should have caused some');
});
