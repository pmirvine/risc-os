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

test('eating pauses: 1 frame a dot, 3 an energizer, acc kept', () => {
  const s = setup();
  s.p.px = 28; s.p.py = 188; s.p.dir = LEFT;
  s.p.tx = 3; s.p.ty = 23;
  s.m.eat(2, 23);
  let r;
  do { r = s.p.tick(s.m, LEFT, 80); } while (!r.ate || r.ate === 10);
  assert.equal(r.ate, 50);
  const acc = s.p.acc, px = s.p.px;
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(s.p.tick(s.m, LEFT, 80), { moved: 0, ate: 0 });
    assert.equal(s.p.acc, acc);
    assert.equal(s.p.px, px);
  }
  assert.equal(s.p.pause, 0);
  s.p.tick(s.m, LEFT, 80);
  assert.ok(s.p.acc !== acc || s.p.px !== px);
});

/** Frames to run left along row 1 from tile 12 to pixel px. */
function runTo(s, px) {
  Object.assign(s.p, { px: 100, py: 12, tx: 12, ty: 1, dir: LEFT });
  let f = 0;
  while (s.p.px > px && f < 999) { s.p.tick(s.m, LEFT, 80); f++; }
  return f;
}

test('a run of 10 dots takes 10 frames longer than none', () => {
  const a = setup(), b = setup();
  for (let x = 2; x < 12; x++) {
    assert.equal(a.m.dotAt(x, 1), 10);
    b.m.eat(x, 1);
  }
  assert.equal(runTo(a, 20) - runTo(b, 20), 10);
});

// Cornering. Row 5 runs left to the junction at column 6 (centre
// x 52, y 44); column 6 goes up to (52, 20), the centre of row 2.
const corner = (px, dir = LEFT) => {
  const s = setup();
  s.m.dots.fill(0);
  Object.assign(s.p, { px, py: 44, tx: px >> 3, ty: 5, dir });
  return s;
};

/** Pixels moved (a frame moves at most one, at 79%) until (px, py);
 *  returns the count and every position on the way. */
function walkTo(s, want, px, py) {
  let n = 0;
  const path = [];
  for (let f = 0; f < 200 && (s.p.px !== px || s.p.py !== py); f++) {
    const m = s.p.tick(s.m, want(s.p), 79).moved;
    n += m;
    if (m) path.push([s.p.px, s.p.py]);
  }
  return { n, path };
}

test('cornering: a turn 3 px early cuts the corner diagonally', () => {
  const s = corner(55);
  const early = walkTo(s, () => UP, 52, 20);
  assert.equal(s.p.dir, UP);
  assert.deepEqual(early.path.slice(0, 3).map((q) => q.join()).sort(),
    ['52,41', '53,42', '54,43']);
  const late = corner(55);
  const centre = walkTo(late, (p) => (p.px === 52 ? UP : LEFT), 52, 20);
  assert.equal(centre.n - early.n, 3);
  assert.equal(early.n, 24);
});

test('cornering: each diagonal step is 1 px up and 1 px across', () => {
  const s = corner(55);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = [s.p.px, s.p.py];
    s.p.acc = 10000;
    s.p.tick(s.m, UP, 79);
    if (s.p.px !== x || s.p.py !== y) {
      seen.push([s.p.px - x, s.p.py - y]);
    }
  }
  assert.deepEqual(seen.slice(0, 3), [[-1, -1], [-1, -1], [-1, -1]]);
  assert.deepEqual(seen[3], [0, -1]);
});

test('cornering: at 80% the early turn is 2 or 3 frames sooner', () => {
  const frames = (px, want) => {
    const s = corner(px);
    let f = 0;
    while ((s.p.px !== 52 || s.p.py !== 20) && f < 999) {
      s.p.tick(s.m, want(s.p), 80);
      f++;
    }
    return f;
  };
  const early = frames(55, () => UP);
  const centre = frames(55, (p) => (p.px === 52 ? UP : LEFT));
  assert.ok(centre - early >= 2 && centre - early <= 3,
    `${centre} - ${early}`);
});

test('cornering: a turn up to 3 px after the centre cuts back', () => {
  const s = corner(49);
  const late = walkTo(s, () => UP, 52, 20);
  assert.equal(s.p.dir, UP);
  assert.deepEqual(late.path.slice(0, 3).map((q) => q.join()).sort(),
    ['50,43', '51,42', '52,41']);
  assert.equal(late.n, 24);
  // Turning at the centre needs the same 24 pixels once aligned; a
  // turn that came 3 px later than the centre would have been lost
  // before: going back to the centre costs 3 more.
  const back = corner(49);
  const old = walkTo(back, (p) => (p.px === 52 ? UP : RIGHT), 52, 20);
  assert.equal(old.n - late.n, 3);
});

test('cornering: 4 px away is too far, a wall is not turned into', () => {
  const far = corner(48, RIGHT);   // tile 6, 4 px before its centre
  far.p.tick(far.m, UP, 100);
  assert.equal(far.p.dir, RIGHT);
  assert.equal(far.p.py, 44);
  const near = corner(49, RIGHT);  // 3 px before: the window opens
  near.p.acc = 10000;
  near.p.tick(near.m, UP, 79);
  assert.equal(near.p.dir, UP);
  const wall = corner(63);   // column 7: row 4 above is wall
  for (let i = 0; i < 6; i++) wall.p.tick(wall.m, UP, 100);
  assert.equal(wall.p.dir, LEFT);
  assert.equal(wall.p.py, 44);
});

test('cornering: reversing works in the middle of a diagonal', () => {
  const s = corner(55);
  s.p.acc = 0;
  s.p.tick(s.m, UP, 80);
  s.p.tick(s.m, UP, 80);
  assert.equal(s.p.dir, UP);
  assert.ok(s.p.py < 44 && s.p.px < 55);
  const y = s.p.py;
  for (let i = 0; i < 40; i++) s.p.tick(s.m, DOWN, 80);
  assert.equal(s.p.dir, DOWN);
  assert.ok(s.p.py > y);
  assert.equal(s.p.px & 7, 4);
  assert.ok(s.m.walkable(s.p.px >> 3, s.p.py >> 3, 'pac'));
});

test('cornering: he never ends up inside a wall', () => {
  const s = setup();
  const seq = [UP, LEFT, DOWN, RIGHT];
  for (let f = 0; f < 6000; f++) {
    s.p.tick(s.m, seq[Math.floor(f / 7) % 4], 100);
    s.m.reset();
    assert.ok(s.m.walkable(s.p.px >> 3, s.p.py >> 3, 'pac'), `f${f}`);
    if (s.p.stopped) {
      assert.deepEqual([s.p.px & 7, s.p.py & 7], [4, 4], `f${f}`);
    }
  }
});

/** Row 1, moving LEFT: a 3 px side turn DOWN at column 6, reversed
 *  after one diagonal pixel into the wall above. */
function stuck(startPx, centre) {
  const s = setup();
  s.m.dots.fill(0);
  Object.assign(s.p, { px: startPx, py: 12, tx: startPx >> 3, ty: 1,
    dir: LEFT });
  const one = (want) => { s.p.acc = 10000; s.p.tick(s.m, want, 79); };
  one(DOWN);
  assert.equal(s.p.dir, DOWN);
  assert.equal(s.p.py, 13);
  one(UP);
  for (let i = 0; i < 6; i++) one(UP);
  assert.deepEqual([s.p.px, s.p.py], [centre, 12]);
  s.one = one;
  return s;
}

test('cornering: reversed after one pixel, he ends on the lane', () => {
  const s = stuck(49, 52);     // 3 px after the centre
  for (let i = 0; i < 20; i++) s.one(RIGHT);
  assert.ok(s.p.px > 52 && s.p.dir === RIGHT);
});

test('cornering: the same 3 px before the centre', () => {
  const s = stuck(55, 52);
  for (let i = 0; i < 20; i++) s.one(LEFT);
  assert.ok(s.p.px < 52 && s.p.dir === LEFT);
  assert.equal(s.p.py, 12);
});
