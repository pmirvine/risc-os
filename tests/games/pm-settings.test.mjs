import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS, DEFAULTS, loadSettings, saveSettings } from
  '../../tools/games/!Pacman/Settings';

const store = (saved) => ({
  wrote: null,
  read: async () => saved,
  write: async function (leaf, o) { this.wrote = [leaf, o]; return true; },
});

test('the options and defaults are the spec\'s', () => {
  assert.deepEqual(OPTIONS.map((o) => o.key), ['display',
    'browserFull', 'sound', 'volume', 'lives', 'bonus']);
  assert.deepEqual(DEFAULTS, { display: 'full', browserFull: false,
    sound: true, volume: 0.8, lives: 3, bonus: 10000 });
  for (const o of OPTIONS) {
    assert.equal(o.names.length, o.values.length, o.key);
    assert.ok(o.label, o.key);
    assert.ok(o.values.includes(DEFAULTS[o.key]), o.key);
  }
  const v = OPTIONS.find((o) => o.key === 'volume');
  assert.deepEqual(v.names, ['20%', '40%', '60%', '80%', '100%']);
  assert.equal(OPTIONS.find((o) => o.key === 'bonus').names[3],
    'None');
});

test('loadSettings: garbage gives the defaults', async () => {
  for (const bad of [null, 5, 'x', [1], {display: 'huge', lives: 4}]) {
    assert.deepEqual(await loadSettings(store(bad)), DEFAULTS);
  }
});

test('loadSettings keeps good values and converts old percents', async () => {
  const s = await loadSettings(store({ display: 'window', lives: 5,
    volume: 60, bonus: 0, sound: false }));
  assert.deepEqual(s, { display: 'window', browserFull: false,
    sound: false, volume: 0.6, lives: 5, bonus: 0 });
});

test('saveSettings writes the Settings leaf', async () => {
  const st = store({});
  await saveSettings(st, { ...DEFAULTS, lives: 2 });
  assert.equal(st.wrote[0], 'Settings');
  assert.equal(st.wrote[1].lives, 2);
});
