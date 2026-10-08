import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitise, stepOption, optionName }
  from '../../tools/games/!GameLib/Options';

const OPTIONS = [
  { key: 'look', values: ['enhanced', 'classic'],
    names: ['Enhanced', 'Classic 1987'] },
  { key: 'volume', values: [0.2, 0.4, 0.6, 0.8, 1],
    names: ['20%', '40%', '60%', '80%', '100%'] },
  { key: 'shadows', values: [true, false], names: ['On', 'Off'] },
];
const DEFAULTS = { look: 'enhanced', volume: 0.8, shadows: true };

test('sanitise keeps only listed values', () => {
  const r = sanitise(OPTIONS, DEFAULTS,
    { look: 'classic', volume: 7, shadows: false, extra: 1 });
  assert.deepEqual(r, { look: 'classic', volume: 0.8, shadows: false });
});

test('sanitise ignores things that are not objects', () => {
  for (const v of ['x', null, undefined, 5, ['classic']]) {
    assert.deepEqual(sanitise(OPTIONS, DEFAULTS, v), DEFAULTS);
  }
  const proto = { __proto__: { look: 'classic' } };
  assert.deepEqual(sanitise(OPTIONS, DEFAULTS, proto), DEFAULTS);
  assert.notEqual(sanitise(OPTIONS, DEFAULTS, null), DEFAULTS);
});

test('stepOption wraps both ways and from an unknown value', () => {
  const s = { look: 'classic', volume: 1, shadows: true };
  assert.equal(stepOption(OPTIONS, s, 'look', 1), 'enhanced');
  assert.equal(stepOption(OPTIONS, s, 'look', -1), 'classic');
  assert.equal(stepOption(OPTIONS, s, 'volume', 1), 0.2);
  assert.equal(stepOption(OPTIONS, s, 'volume', -1), 1);
  s.volume = 'odd';
  assert.equal(stepOption(OPTIONS, s, 'volume', 1), 0.4);
});

test('optionName shows the name or the raw value', () => {
  assert.equal(optionName(OPTIONS, { look: 'classic' }, 'look'),
    'Classic 1987');
  assert.equal(optionName(OPTIONS, { volume: 3 }, 'volume'), '3');
});
