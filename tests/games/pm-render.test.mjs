import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rgb } from '../../tools/games/!GameLib/Surface';
import { drawText } from '../../tools/games/!GameLib/Font';
import { ROWS, SPECIAL } from '../../tools/games/!Pacman/MazeData';
import { COLOURS } from '../../tools/games/!Pacman/Theme';
import { Game } from '../../tools/games/!Pacman/Game';
import { wallPixels, mazeSurface }
  from '../../tools/games/!Pacman/MazeDraw';
import { drawPac, drawGhost, drawDigits, drawFruit }
  from '../../tools/games/!Pacman/Sprites';
import { drawHud } from '../../tools/games/!Pacman/Hud';
import { drawGame, MAZE_TOP } from '../../tools/games/!Pacman/Render';

const W = 224, H = 248;
const col = (c) => rgb(...c);
const count = (s, c) => s.pixels.reduce((n, p) => n + (p === c), 0);
const wall = wallPixels(ROWS);

// the distance from a pixel to the nearest pixel of a tile that is
// not '#', by brute force
function dist(x, y) {
  let best = Infinity;
  for (let ty = 0; ty < 31; ty++) {
    for (let tx = 0; tx < 28; tx++) {
      if (ROWS[ty][tx] === '#') continue;
      const cx = Math.max(tx * 8, Math.min(tx * 8 + 7, x));
      const cy = Math.max(ty * 8, Math.min(ty * 8 + 7, y));
      best = Math.min(best, Math.hypot(cx - x, cy - y));
    }
  }
  return best;
}

test('wallPixels is mirrored and stays inside wall tiles', () => {
  assert.equal(wall.length, W * H);
  let marked = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = wall[y * W + x];
      assert.equal(v, wall[y * W + (W - 1 - x)], `${x},${y}`);
      if (v) {
        marked++;
        assert.equal(ROWS[y >> 3][x >> 3], '#', `${x},${y}`);
      }
    }
  }
  assert.ok(marked > 2000);
});

test('lines lie 2.5-3.5 from open space, outer ones also 5.5-6.5', () => {
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < 112; x += 1) {
      if (ROWS[y >> 3][x >> 3] !== '#') continue;
      const d = dist(x, y);
      const first = d >= 2.5 && d <= 3.5;
      const second = d >= 5.5 && d <= 6.5;
      const v = wall[y * W + x] === 1;
      if (first) assert.ok(v, `first line missing at ${x},${y}`);
      if (v) assert.ok(first || second, `stray ${x},${y} d=${d}`);
    }
  }
});

test('the second line only borders walls on the grid edge', () => {
  assert.equal(wall[2 * W + 100], 1);          // outer wall, d = 6
  assert.equal(wall[28 * W + 21], 0);          // a block, d = 6
  assert.equal(wall[28 * W + 18], 1);          // the block, d = 3
});

test('mazeSurface is a cached 224 x 248 Surface', () => {
  const a = mazeSurface(ROWS, COLOURS);
  assert.equal(a.width, W);
  assert.equal(a.height, H);
  assert.equal(mazeSurface(ROWS, COLOURS), a);
  assert.equal(count(a, col(COLOURS.wall)),
    wall.reduce((n, v) => n + v, 0));
  assert.ok(count(a, col(COLOURS.door)) >= 32);
  const white = mazeSurface(ROWS, { ...COLOURS, wall: COLOURS.flash });
  assert.notEqual(white, a);
});

test('drawGame at the start shows the maze, Pac-Man and Blinky', () => {
  const g = new Game({ seed: 1 });
  const s = new Surface(224, 288);
  drawGame(s, g, 0);
  assert.ok(count(s, col(COLOURS.wall)) > 1000);
  assert.equal(s.get(112, 188 + MAZE_TOP), col(COLOURS.pac));
  assert.equal(s.get(112, 92 + MAZE_TOP), col(COLOURS.ghosts[0]));
  assert.equal(s.get(12, 12 + MAZE_TOP), col(COLOURS.dot));
  assert.equal(s.get(13, 13 + MAZE_TOP), col(COLOURS.dot));
});

test('energizers blink every 10 frames', () => {
  const g = new Game({ seed: 1 });
  const s = new Surface(224, 288);
  drawGame(s, g, 0);
  const on = count(s, col(COLOURS.dot));
  drawGame(s, g, 10);
  assert.ok(count(s, col(COLOURS.dot)) < on - 20);
  drawGame(s, g, 20);
  assert.equal(count(s, col(COLOURS.dot)), on);
});

test('Pac-Man mouth: 0, 22, 45, 22 degrees', () => {
  const n = [];
  for (let anim = 0; anim < 8; anim += 2) {
    const s = new Surface(32, 32);
    drawPac(s, 16, 16, 3, anim, -1);
    n.push(count(s, col(COLOURS.pac)));
  }
  assert.ok(n[0] > n[1] && n[1] > n[2], n.join());
  assert.equal(n[1], n[3]);
  const s = new Surface(32, 32);
  drawPac(s, 16, 16, 3, 4, -1);
  assert.equal(s.get(21, 16), 0);        // the mouth faces right
  assert.equal(s.get(11, 16), col(COLOURS.pac));
});

test('a stopped Pac-Man keeps the mouth he stopped with', () => {
  const pacPixels = (anim, stopped) => {
    const g = new Game({ seed: 1 });
    g.player.anim = anim;
    g.player.stopped = stopped;
    const s = new Surface(224, 288);
    drawGame(s, g, 0);
    return count(s, col(COLOURS.pac));
  };
  assert.equal(pacPixels(4, true), pacPixels(4, false));
  assert.ok(pacPixels(4, true) < pacPixels(0, true));
});

test('Pac-Man dies: the wedge widens, then a burst', () => {
  const n = [];
  for (let d = 0; d <= 10; d++) {
    const s = new Surface(32, 32);
    drawPac(s, 16, 16, 1, 0, d);
    n.push(count(s, col(COLOURS.pac)));
  }
  assert.ok(n[1] < n[0] && n[5] < n[2]);
  assert.ok(n[10] > 0 && n[10] < n[5]);
});

test('a ghost skirt changes every 8 frames; wrapped actors clip', () => {
  const g = { id: 0, state: 'active', dir: 1, turn: 1, blue: false };
  const a = new Surface(32, 32), b = new Surface(32, 32);
  drawGhost(a, 16, 16, g, 0, false);
  drawGhost(b, 16, 16, g, 8, false);
  assert.notDeepEqual(a.pixels, b.pixels);
  const c = new Surface(32, 32);
  drawGhost(c, 16, 16, g, 3, false);
  assert.deepEqual(a.pixels, c.pixels);
});

test('blue and eaten ghosts look different', () => {
  const body = (g, white) => {
    const s = new Surface(32, 32);
    drawGhost(s, 16, 16, g, 0, white);
    return s;
  };
  const base = { id: 1, state: 'active', dir: 0, turn: 0 };
  const blue = body({ ...base, blue: true }, false);
  assert.ok(count(blue, col(COLOURS.blue)) > 80);
  const flash = body({ ...base, blue: true }, true);
  assert.ok(count(flash, col(COLOURS.flash)) > 80);
  const eyes = body({ ...base, state: 'eyes' }, false);
  assert.equal(count(eyes, col(COLOURS.ghosts[1])), 0);
  assert.ok(count(eyes, rgb(255, 255, 255)) > 8);
});

test('actors in the tunnel never write outside the maze', () => {
  const g = new Game({ seed: 1 });
  g.player.px = 2; g.player.py = 14 * 8 + 4;
  g.ghosts[0].px = 221; g.ghosts[0].py = 14 * 8 + 4;
  const s = new Surface(240, 288);
  drawGame(s, g, 0);
  for (let y = 0; y < 288; y++) {
    for (let x = 224; x < 240; x++) assert.equal(s.get(x, y), rgb(0, 0, 0));
  }
  assert.ok(s.get(2, 14 * 8 + 4 + MAZE_TOP) === col(COLOURS.pac));
});

test('drawDigits writes the 4 x 6 digit set', () => {
  const s = new Surface(40, 10);
  drawDigits(s, 1, 1, '200', 0xFFFFFFFF);
  assert.ok(count(s, 0xFFFFFFFF) > 20);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 40; x++) {
      if (s.get(x, y)) assert.ok(x >= 1 && x < 13 && y >= 1 && y < 7);
    }
  }
});

function same(ref, s, x0, y0, w, h) {
  let lit = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (ref.get(x, y)) { lit++; assert.equal(s.get(x, y), ref.get(x, y)); }
    }
  }
  return lit;
}

test('Hud: HIGH SCORE at row 0 and READY! at y 160 during start', () => {
  const g = new Game({ seed: 1 });
  const s = new Surface(224, 288);
  drawHud(s, g, 0, 12345);
  const ref = new Surface(224, 288);
  drawText(ref, 'HIGH SCORE', 72, 0, { colour: col(COLOURS.text) });
  drawText(ref, 'READY!', 88, 160, { colour: col(COLOURS.ready) });
  assert.ok(same(ref, s, 72, 0, 80, 8) > 30);
  assert.ok(same(ref, s, 88, 160, 48, 8) > 20);
  g.setState('play');
  const t = new Surface(224, 288);
  drawHud(t, g, 0, 0);
  assert.equal(t.get(89, 163), 0);
});

test('Hud: score, lives and level fruit', () => {
  const g = new Game({ seed: 1, lives: 3 });
  g.score = 230;
  const s = new Surface(224, 288);
  drawHud(s, g, 0, 230);
  let lit = 0;
  for (let x = 0; x < 224; x++) {
    if (s.get(x, 8) || s.get(x, 9) || s.get(x, 11)) lit++;
  }
  assert.ok(lit > 10);
  let pac = 0;
  for (let y = 264; y < 288; y++) {
    for (let x = 0; x < 100; x++) pac += s.get(x, y) === col(COLOURS.pac);
  }
  assert.ok(pac > 100);
  let fruit = 0;
  for (let y = 264; y < 288; y++) {
    for (let x = 180; x < 224; x++) fruit += s.get(x, y) !== 0;
  }
  assert.ok(fruit > 20);
});

/** Pixels of colour c in the 24 x 24 box centred on maze (px, py). */
function near(s, px, py, c) {
  let n = 0;
  for (let y = py - 12; y < py + 12; y++) {
    for (let x = px - 12; x < px + 12; x++) {
      if (s.get(x, y + MAZE_TOP) === c) n++;
    }
  }
  return n;
}

test('while a ghost is eaten: no Pac-Man, no ghost, its score', () => {
  const g = new Game({ seed: 1 });
  g.debug.skipIntro();
  g.debug.place(0, 60, 44, 3);
  g.debug.place(1, 160, 44, 3);
  g.ghosts[2].state = g.ghosts[3].state = 'house';
  g.ghosts[2].py = g.ghosts[3].py = 200;      // out of the way
  g.eatenId = 0;
  g.popups = [{ px: 60, py: 44, text: '200', frames: 40 }];
  g.state = 'eaten';
  const s = new Surface(W, 288);
  drawGame(s, g, 0);
  assert.equal(near(s, 112, 188, col(COLOURS.pac)), 0, 'no Pac-Man');
  assert.equal(near(s, 60, 44, col(COLOURS.ghosts[0])), 0, 'no ghost');
  assert.ok(near(s, 60, 44, col(COLOURS.text)) > 10, 'the score');
  assert.ok(near(s, 160, 44, col(COLOURS.ghosts[1])) > 40, 'others');
  g.state = 'play';
  const t = new Surface(W, 288);
  drawGame(t, g, 0);
  assert.ok(near(t, 112, 188, col(COLOURS.pac)) > 40, 'Pac-Man back');
});

test('eyes (an eaten ghost on its way home) draw no body', () => {
  const g = new Game({ seed: 1 });
  g.debug.skipIntro();
  g.debug.place(0, 60, 44, 3);
  g.ghosts[0].eat();
  const s = new Surface(W, 288);
  drawGame(s, g, 0);
  assert.equal(near(s, 60, 44, col(COLOURS.ghosts[0])), 0);
  assert.ok(near(s, 60, 44, rgb(255, 255, 255)) > 8, 'eyes');
});

// ---- levelDone, fruit, and the Hud's fruit from Levels ----

/** Count wall-coloured pixels of the maze area. */
function wallCount(g, frame = 0) {
  const s = new Surface(W, 288);
  drawGame(s, g, frame);
  let n = 0;
  const c = col(COLOURS.wall);
  for (let y = MAZE_TOP; y < MAZE_TOP + 248; y++) {
    for (let x = 0; x < W; x++) n += s.get(x, y) === c;
  }
  return n;
}

test('levelDone: the maze goes white as Levels says', () => {
  const g = new Game({ seed: 1 });
  g.debug.skipIntro();
  g.state = 'levelDone';
  g.stateTimer = 100;
  const blue = wallCount(g);
  assert.ok(blue > 500);
  g.stateTimer = 120;
  assert.equal(wallCount(g), 0, 'white at 120');
  g.stateTimer = 134;
  assert.equal(wallCount(g), 0);
  g.stateTimer = 135;
  assert.equal(wallCount(g), blue);
  g.stateTimer = 210;
  assert.equal(wallCount(g), 0);
  g.stateTimer = 225;
  assert.equal(wallCount(g), blue);
});

test('levelDone: Pac-Man stays, ghosts vanish from tick 60', () => {
  const g = new Game({ seed: 1 });
  g.debug.skipIntro();
  g.state = 'levelDone';
  g.stateTimer = 59;
  const a = new Surface(W, 288);
  drawGame(a, g, 0);
  assert.ok(near(a, g.ghosts[0].px, g.ghosts[0].py,
    col(COLOURS.ghosts[0])) > 40, 'Blinky at 59');
  assert.ok(near(a, g.player.px, g.player.py, col(COLOURS.pac)) > 40);
  g.stateTimer = 60;
  const b = new Surface(W, 288);
  drawGame(b, g, 0);
  assert.equal(near(b, g.ghosts[0].px, g.ghosts[0].py,
    col(COLOURS.ghosts[0])), 0, 'Blinky gone at 60');
  assert.ok(near(b, g.player.px, g.player.py, col(COLOURS.pac)) > 40);
});

test('the fruit is drawn only while it is shown', () => {
  const g = new Game({ seed: 1 });
  g.debug.skipIntro();
  const f = SPECIAL.fruit;
  const a = new Surface(W, 288);
  drawGame(a, g, 0);
  const none = [0, 1, 2].map((i) => near(a, f.px, f.py, i)).join();
  g.fruit.onDots(70);
  const b = new Surface(W, 288);
  drawGame(b, g, 0);
  let lit = 0;
  for (let y = f.py - 8; y < f.py + 8; y++) {
    for (let x = f.px - 8; x < f.px + 8; x++) {
      lit += b.get(x, y + MAZE_TOP) !== a.get(x, y + MAZE_TOP);
    }
  }
  assert.ok(lit > 20, 'fruit pixels ' + lit + ' ' + none);
});

test('the Hud fruit row follows Levels', () => {
  const g = new Game({ seed: 1, level: 13 });
  const s = new Surface(224, 288);
  drawHud(s, g, 0, 0);
  const t = new Surface(224, 288);
  drawFruit(t, 208, 280, 'key');
  drawFruit(t, 192, 280, 'bell');
  let diff = 0;
  for (let y = 264; y < 288; y++) {
    for (let x = 190; x < 224; x++) diff += s.get(x, y) !== t.get(x, y);
  }
  assert.equal(diff, 0);
});
