import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillTriangle, fillBox }
  from '../../tools/games/!GameLib/Raster';
import { Rng } from '../../tools/games/!GameLib/Maths';

const L = await import('../../tools/lander2/!Lander2/Raster');
const W = 64, H = 48;

test('200 random triangles match Lander II', () => {
  const r = new Rng(3);
  const a = new Uint32Array(W * H), b = new Uint32Array(W * H);
  for (let i = 0; i < 200; i++) {
    const v = [];
    for (let k = 0; k < 3; k++) v.push(r.range(-10, W + 10), r.range(-10, H + 10));
    const c = r.next();
    fillTriangle(a, W, 2, H - 2, ...v, c);
    L.fillTriangle(b, W, 2, H - 2, ...v, c);
  }
  assert.deepEqual(a, b);
  assert.ok(a.some((p) => p !== 0));
});

test('fillBox matches Lander II', () => {
  const r = new Rng(4);
  const a = new Uint32Array(W * H), b = new Uint32Array(W * H);
  for (let i = 0; i < 100; i++) {
    const x = r.int(W + 20) - 10, y = r.int(H + 20) - 10;
    const w = r.int(30), h = r.int(30), c = r.next();
    fillBox(a, W, 1, H - 1, x, y, w, h, c);
    L.fillBox(b, W, 1, H - 1, x, y, w, h, c);
  }
  assert.deepEqual(a, b);
});
