import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keys } from '../../tools/games/!GameLib/Keys';

const ACTIONS = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'],
  right: ['ArrowRight'], pause: ['KeyP'],
};
const DIRS = ['up', 'down', 'left', 'right'];
const ev = (code, more = {}) => ({ code, key: code, ...more });

test('latest is the last pressed direction still held', () => {
  const k = new Keys(ACTIONS);
  k.keyDown(ev('ArrowLeft'));
  k.keyDown(ev('ArrowUp'));
  assert.equal(k.latest(DIRS), 'up');
  k.keyUp(ev('ArrowUp'));
  assert.equal(k.latest(DIRS), 'left');
  k.keyUp(ev('ArrowLeft'));
  assert.equal(k.latest(DIRS), null);
});

test('release clears held and latest; a late keyUp is harmless', () => {
  const k = new Keys(ACTIONS);
  k.keyDown(ev('ArrowLeft'));
  k.release();
  assert.equal(k.latest(DIRS), null);
  assert.equal(k.held('left'), false);
  k.keyUp(ev('ArrowLeft'));
  assert.equal(k.latest(DIRS), null);
});

test('a repeat sets no pressed but is queued as a repeat', () => {
  const k = new Keys(ACTIONS);
  k.keyDown(ev('KeyP', { repeat: true }));
  assert.equal(k.pressed('pause'), false);
  assert.equal(k.held('pause'), true);
  const p = k.takePresses();
  assert.equal(p.length, 1);
  assert.equal(p[0].repeat, true);
  assert.deepEqual(k.takePresses(), []);
  k.keyDown(ev('KeyP', { shiftKey: true }));
  assert.equal(k.pressed('pause'), true);
  assert.equal(k.takePresses()[0].shift, true);
});

test('an unmapped key returns false but still queues the press', () => {
  const k = new Keys(ACTIONS);
  assert.equal(k.keyDown(ev('KeyZ')), false);
  assert.equal(k.keyDown(ev('ArrowUp')), true);
  assert.equal(k.takePresses().length, 2);
});

test('clearEdges empties presses and pressed', () => {
  const k = new Keys(ACTIONS);
  k.keyDown(ev('KeyP'));
  k.clearEdges();
  assert.equal(k.pressed('pause'), false);
  assert.deepEqual(k.takePresses(), []);
  assert.equal(k.held('pause'), true);
});
