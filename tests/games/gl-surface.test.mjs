import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rgb, rgb4, unrgb }
  from '../../tools/games/!GameLib/Surface';
import { fakeCtx } from './fakes.mjs';

test('a Surface needs no document', () => {
  assert.equal(typeof document, 'undefined');
  const s = new Surface(224, 288);
  assert.equal(s.pixels.length, 224 * 288);
  assert.equal(s.width, 224);
  assert.equal(s.height, 288);
});

test('colour helpers', () => {
  assert.equal(rgb(255, 0, 0), 0xFF0000FF);
  assert.equal(rgb4(15, 0, 0), rgb(255, 0, 0));
  assert.deepEqual(unrgb(rgb(1, 2, 3)), [1, 2, 3]);
});

test('fillRect is clipped', () => {
  const s = new Surface(10, 10);
  s.fillRect(-5, -5, 10, 10, 7);
  assert.equal(s.pixels.filter((p) => p === 7).length, 25);
  s.clear(0);
  s.fillRect(8, 8, 10, 10, 7);
  assert.equal(s.pixels.filter((p) => p === 7).length, 4);
  s.fillRect(20, 20, 5, 5, 9);
  s.fillRect(-9, 0, 5, 5, 9);
  assert.equal(s.pixels.filter((p) => p === 9).length, 0);
});

test('hline includes both ends', () => {
  const s = new Surface(10, 3);
  s.hline(2, 5, 1, 4);
  assert.equal(s.pixels.filter((p) => p === 4).length, 4);
  assert.equal(s.get(2, 1), 4);
  assert.equal(s.get(5, 1), 4);
  assert.equal(s.get(6, 1), 0);
  s.hline(9, 7, 0, 5);
  assert.equal(s.get(7, 0), 5);
});

test('get outside returns 0', () => {
  const s = new Surface(4, 4);
  s.clear(3);
  assert.equal(s.get(-1, 0), 0);
  assert.equal(s.get(4, 0), 0);
  assert.equal(s.get(0, 4), 0);
  assert.equal(s.get(3, 3), 3);
});

test('blit skips the key colour and clips', () => {
  const src = new Surface(3, 1);
  src.pixels.set([1, 2, 1]);
  const s = new Surface(5, 2);
  s.clear(9);
  s.blit(src, 1, 1, 1);
  assert.deepEqual([...s.pixels.slice(5)], [9, 9, 2, 9, 9]);
  s.blit(src, 4, 0);
  assert.equal(s.get(4, 0), 1);
  s.blit(src, -2, 0);
  assert.equal(s.get(0, 0), 1);
});

test('present puts the image once and draws it scaled', () => {
  const { ctx, log, made } = fakeCtx();
  const s = new Surface(4, 4);
  s.clear(rgb(255, 0, 0));
  s.present(ctx, 10, 20, 40, 40);
  const put = log.filter((l) => l[0] === 'putImageData');
  const draw = log.filter((l) => l[0] === 'drawImage');
  assert.equal(put.length, 1);
  assert.equal(draw.length, 1);
  assert.equal(put[0][1].data[0], 255);
  assert.deepEqual(draw[0].slice(2), [10, 20, 40, 40]);
  assert.equal(draw[0][1], made[0]);
  assert.equal(ctx.imageSmoothingEnabled, false);
  s.present(ctx, 0, 0, 8, 8);
  assert.equal(made.length, 1);
});
