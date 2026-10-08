import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../tools/games/!GameLib/Surface';
import { disc, pie, arc, line, polygon, roundRect }
  from '../../tools/games/!GameLib/Shapes';

const count = (s) => s.pixels.filter((p) => p).length;
const same = (a, b) => assert.deepEqual(a.pixels, b.pixels);

// Is the surface unchanged by mirroring in x and in y about (c, c)?
function symmetric(s, c) {
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const v = s.get(x, y);
      if (v !== s.get(2 * c - 1 - x, y)) return false;
      if (v !== s.get(x, 2 * c - 1 - y)) return false;
    }
  }
  return true;
}

test('disc pixel counts and symmetry', () => {
  for (const [r, c, n] of [[6.5, 8, 124], [3, 4, 32], [8, 8, 208]]) {
    const s = new Surface(16, 16);
    disc(s, c, c, r, 1);
    assert.equal(count(s), n, `r ${r}`);
    assert.ok(symmetric(s, c), `r ${r} symmetric`);
  }
});

test('disc is clipped', () => {
  const s = new Surface(8, 8);
  disc(s, 0, 0, 5, 1);
  assert.ok(count(s) > 0 && s.get(0, 0) === 1 && s.get(7, 7) === 0);
});

test('pie with a0 = -a1 is mirror-symmetric about y = cy', () => {
  const s = new Surface(16, 16);
  pie(s, 8, 8, 7, -0.6, 0.6, 1);
  assert.ok(count(s) > 5);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 16; x++) {
      assert.equal(s.get(x, y), s.get(x, 15 - y), `${x},${y}`);
    }
  }
  assert.equal(s.get(14, 8), 1);
  assert.equal(s.get(1, 8), 0);
});

test('a full pie equals a disc', () => {
  const a = new Surface(16, 16), b = new Surface(16, 16);
  pie(a, 8, 8, 6.5, 0, 2 * Math.PI, 1);
  disc(b, 8, 8, 6.5, 1);
  same(a, b);
});

test('arc is a thin ring inside the disc', () => {
  const a = new Surface(16, 16), d = new Surface(16, 16);
  arc(a, 8, 8, 6.5, 0, 2 * Math.PI, 1, 2);
  disc(d, 8, 8, 6.5, 1);
  assert.ok(count(a) > 0 && count(a) < count(d));
  assert.equal(a.get(8, 8), 0);
  for (let i = 0; i < a.pixels.length; i++) {
    if (a.pixels[i]) assert.equal(d.pixels[i], 1);
  }
});

test('line includes both ends', () => {
  const s = new Surface(8, 8);
  line(s, 0, 0, 7, 3, 1);
  assert.equal(count(s), 8);
  assert.equal(s.get(0, 0), 1);
  assert.equal(s.get(7, 3), 1);
});

test('roundRect with r 0 equals fillRect', () => {
  const a = new Surface(16, 16), b = new Surface(16, 16);
  roundRect(a, 2, 3, 9, 7, 0, 1);
  b.fillRect(2, 3, 9, 7, 1);
  same(a, b);
  const c = new Surface(16, 16);
  roundRect(c, 2, 3, 9, 7, 3, 1);
  assert.ok(count(c) < count(b) && c.get(2, 3) === 0 && c.get(6, 6) === 1);
});

test('polygon of a square equals fillRect', () => {
  const a = new Surface(16, 16), b = new Surface(16, 16);
  polygon(a, [[2, 3], [10, 3], [10, 9], [2, 9]], 1);
  b.fillRect(2, 3, 8, 6, 1);
  same(a, b);
});
