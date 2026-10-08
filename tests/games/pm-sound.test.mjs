import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderDef } from '../../tools/games/!GameLib/SynthFx';
import { RATE, RECIPES, WAVES }
  from '../../tools/games/!Pacman/Sfx';
import { soundsFor, loopFor }
  from '../../tools/games/!Pacman/SoundMap';

const NAMES = ['startJingle', 'waka0', 'waka1', 'siren0', 'siren1',
  'siren2', 'siren3', 'siren4', 'fright', 'eyes', 'ghostEaten',
  'fruitEaten', 'extraLife', 'death'];
const LOOPS = ['siren0', 'siren1', 'siren2', 'siren3', 'siren4',
  'fright', 'eyes'];
const render = (n) => renderDef({ rate: RATE, target: -19 },
  { make: RECIPES[n].make, loop: 0 }, 3);

test('the recipes are the ones the spec lists', () => {
  assert.equal(RATE, 24000);
  assert.deepEqual(Object.keys(RECIPES).sort(), [...NAMES].sort());
  for (const n of NAMES) {
    assert.equal(!!RECIPES[n].loop, LOOPS.includes(n), n);
  }
});

test('the waveforms are our own 32 levels of 4 bits', () => {
  assert.ok(Object.keys(WAVES).length >= 3);
  for (const w of Object.values(WAVES)) {
    assert.equal(w.length, 32);
    for (const v of w) assert.ok(Number.isInteger(v) && v >= 0 && v < 16);
  }
});

for (const n of NAMES) {
  test(`${n} renders finite, audible and repeatable`, () => {
    const a = render(n);
    assert.ok(a instanceof Float32Array);
    assert.ok(a.length > RATE * 0.05, 'long enough');
    let peak = 0;
    for (const x of a) {
      assert.ok(Number.isFinite(x));
      peak = Math.max(peak, Math.abs(x));
    }
    assert.ok(peak > 0.1 && peak <= 1, 'peak ' + peak);
    assert.deepEqual(render(n), a);
  });
}

test('the start jingle is 4.2 seconds', () => {
  const a = render('startJingle');
  assert.ok(Math.abs(a.length / RATE - 4.2) <= 0.05, a.length / RATE);
});

for (const n of LOOPS) {
  test(`${n} loops seamlessly`, () => {
    const a = render(n);
    assert.ok(Math.abs(a[0] - a[a.length - 1]) < 0.05,
      `${a[0]} vs ${a[a.length - 1]}`);
    assert.ok(a.length / RATE >= 0.2);
  });
}

test('the sirens rise in pitch step by step', () => {
  const zc = (a) => { let c = 0;
    for (let i = 1; i < a.length; i++) {
      if ((a[i - 1] < 0) !== (a[i] < 0)) c++;
    }
    return c / (a.length / RATE); };
  const r = [0, 1, 2, 3, 4].map((i) => zc(render('siren' + i)));
  for (let i = 1; i < 5; i++) assert.ok(r[i] > r[i - 1], r.join());
});

test('the effects are our own: source has no ROM data', () => {
  const t = fs.readFileSync(new URL(
    '../../tools/games/!Pacman/Sfx', import.meta.url), 'latin1');
  assert.ok(!/\brom\b|namco/i.test(t.replace(/^\/\/.*$/mg, '')));
});

test('soundsFor maps events to sounds', () => {
  const mem = { waka: 0 };
  const ev = (...t) => t.map((type) => ({ type }));
  assert.deepEqual(soundsFor(ev('dot', 'dot', 'dot'), mem),
    ['waka0', 'waka1', 'waka0']);
  assert.deepEqual(soundsFor(ev('dot'), mem), ['waka1']);
  assert.deepEqual(soundsFor(ev('energizer'), mem), ['waka0']);
  assert.deepEqual(soundsFor(ev('start'), mem), ['startJingle']);
  for (const n of ['ghostEaten', 'fruitEaten', 'extraLife', 'death']) {
    assert.deepEqual(soundsFor(ev(n), mem), [n]);
  }
});

test('soundsFor ignores unknown events and never throws', () => {
  const mem = { waka: 0 };
  assert.deepEqual(soundsFor([{ type: 'bonus', points: 100 },
    { type: 'modeChange' }, { type: 'nope' }, {}, null, 7,
    { type: 'frightStart' }, { type: 'ready' }], mem), []);
  assert.deepEqual(soundsFor(undefined, mem), []);
  assert.deepEqual(soundsFor([{ type: 'dot' }], undefined), ['waka0']);
});

const G = (o = {}) => ({
  state: 'play', demo: false, fright: { on: false },
  maze: { dotsLeft: 244 },
  ghosts: [{ state: 'active' }, { state: 'active' }],
  ...o });

test('loopFor is null unless playing, or in a demo', () => {
  assert.equal(loopFor(G()), 'siren0');
  for (const s of ['start', 'ready', 'eaten', 'dying', 'levelDone',
    'gameOver', 'over']) assert.equal(loopFor(G({ state: s })), null, s);
  assert.equal(loopFor(G({ demo: true })), null);
  assert.equal(loopFor(null), null);
});

test('loopFor: eyes over fright over the siren', () => {
  const eyes = [{ state: 'active' }, { state: 'eyes' }];
  const f = { on: true };
  assert.equal(loopFor(G({ ghosts: eyes, fright: f })), 'eyes');
  assert.equal(loopFor(G({ ghosts: [{ state: 'entering' }] })), 'eyes');
  assert.equal(loopFor(G({ fright: f })), 'fright');
});

test('loopFor: siren steps by dots left (appendix 12)', () => {
  const at = (n) => loopFor(G({ maze: { dotsLeft: n } }));
  const want = [[244, 'siren0'], [181, 'siren0'], [180, 'siren1'],
    [129, 'siren1'], [128, 'siren2'], [65, 'siren2'], [64, 'siren3'],
    [33, 'siren3'], [32, 'siren4'], [1, 'siren4']];
  for (const [n, s] of want) assert.equal(at(n), s, 'dots ' + n);
});

test('volume is 0..1; an old percent is converted', async () => {
  const { tidyVolume, Sound } =
    await import('../../tools/games/!Pacman/Sound');
  const { sanitise } = await import('../../tools/games/!GameLib/Options');
  const O = [{ key: 'volume', values: [0.2, 0.4, 0.6, 0.8, 1] }];
  const load = (v) => sanitise(O, { volume: 0.8 },
    tidyVolume({ volume: v })).volume;
  assert.equal(load(0.6), 0.6);
  assert.equal(load(1), 1);
  assert.equal(load(80), 0.8);
  assert.equal(load(20), 0.2);
  for (const bad of [45, 500, -3, 'loud', null, NaN]) {
    assert.equal(load(bad), 0.8, String(bad));
  }
  assert.equal(tidyVolume(undefined), undefined);
  assert.equal(new Sound({ volume: 0.4 }, null).volume(), 0.4);
  assert.equal(new Sound({}, null).volume(), 0.8);
});
