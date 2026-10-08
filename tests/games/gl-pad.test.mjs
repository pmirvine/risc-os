import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollPad } from '../../tools/games/!GameLib/Pad';
import { fakePads } from './fakes.mjs';

test('no pad gives nothing', () => {
  for (const g of [() => [], () => null, () => { throw new Error('x'); }]) {
    assert.deepEqual(pollPad(g, null), { presses: [], held: new Set() });
  }
});

test('a button press fires once', () => {
  const g = fakePads({ down: [12] });
  const a = pollPad(g, null);
  assert.deepEqual(a.presses, ['PadUp']);
  const b = pollPad(g, a.held);
  assert.deepEqual(b.presses, []);
  assert.ok(b.held.has('PadUp'));
});

test('the other buttons are named', () => {
  const r = pollPad(fakePads({ down: [0, 1, 9, 13, 14, 15] }), null);
  assert.deepEqual([...r.held].sort(), ['PadA', 'PadB', 'PadDown',
    'PadLeft', 'PadRight', 'PadStart']);
});

test('the stick uses its dominant axis and a dead zone', () => {
  assert.deepEqual(pollPad(fakePads({ axes: [0.9, 0.2] }), null).presses,
    ['PadRight']);
  assert.deepEqual(pollPad(fakePads({ axes: [-0.2, -0.8] }), null).presses,
    ['PadUp']);
  assert.deepEqual(pollPad(fakePads({ axes: [0.3, 0.3] }), null).presses,
    []);
});
