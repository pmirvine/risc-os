import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../../tools/games/!GameLib/Maths';
import { Fruit } from '../../tools/games/!Pacman/Fruit';

test('nothing at 69 dots, shown at 70 with 540 + rng.int(60)', () => {
  const f = new Fruit(1, new Rng(7));
  f.onDots(69);
  assert.equal(f.shown, false);
  f.onDots(70);
  assert.equal(f.shown, true);
  assert.equal(f.timer, 540 + new Rng(7).int(60));
  assert.deepEqual([f.kind, f.points], ['cherries', 100]);
});

test('it hides after timer ticks, not before', () => {
  const f = new Fruit(2, new Rng(3));
  f.onDots(70);
  const t = f.timer;
  for (let i = 1; i < t; i++) { f.tick(); assert.equal(f.shown, true); }
  f.tick();
  assert.equal(f.shown, false);
  f.tick();
  assert.equal(f.shown, false);
});

test('again at 170 dots, not at 171, and never a third time', () => {
  const f = new Fruit(3, new Rng(1));
  f.onDots(70);
  f.clear();
  f.onDots(71);
  assert.equal(f.shown, false);
  f.onDots(170);
  assert.equal(f.shown, true);
  f.clear();
  f.onDots(171);
  assert.equal(f.shown, false);
  for (let d = 0; d <= 244; d++) f.onDots(d);
  assert.equal(f.shown, false);
  assert.equal(f.kind, 'peach');
});

test('a dot count seen twice shows it once only', () => {
  const f = new Fruit(1, new Rng(1));
  f.onDots(70);
  f.clear();
  f.onDots(70);
  assert.equal(f.shown, false);
});

test('eat returns the points and hides; not shown, no points', () => {
  const f = new Fruit(9, new Rng(1));
  assert.equal(f.eat(), 0);
  f.onDots(70);
  assert.equal(f.eat(), 2000);
  assert.equal(f.shown, false);
  assert.equal(f.eat(), 0);
});
