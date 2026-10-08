import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Audio, desktopGain } from '../../tools/games/!GameLib/Audio';
import { fakeAudioContext } from './fakes.mjs';

const make = (k) => { const a = k.buffer(0.1); k.tone(a, { freq: 440 });
  return a; };

function setup(opts = {}) {
  const ctx = fakeAudioContext();
  const calls = {};
  const mk = (n) => (k) => { calls[n] = (calls[n] ?? 0) + 1; return make(k); };
  const au = new Audio({ context: ctx, ...opts });
  au.define('blip', mk('blip'), { rate: 8000 });
  au.define('siren0', mk('siren0'), { rate: 8000, loop: true });
  return { ctx, calls, au };
}

test('desktopGain from the config', () => {
  const cfg = (speaker, volume) => ({
    get: (k) => (k === 'speaker' ? speaker : volume) });
  assert.equal(desktopGain(cfg(false, 7)), 0);
  assert.equal(desktopGain(cfg(true, 3)), 0.5);
  assert.equal(desktopGain(cfg(undefined, undefined)), 1);
  assert.equal(desktopGain(undefined), 1);
});

test('no AudioContext: not live, play false, no throw', () => {
  const saved = globalThis.AudioContext;
  delete globalThis.AudioContext;
  const au = new Audio({});
  au.define('blip', make, { rate: 8000 });
  au.resume();
  assert.equal(au.live, false);
  assert.equal(au.play('blip'), false);
  au.loop('blip', true); au.silence(); au.close();
  if (saved) globalThis.AudioContext = saved;
});

test('nothing happens before resume', () => {
  const { au, calls } = setup();
  assert.deepEqual(calls, {});
  assert.equal(au.play('blip'), false);
});

test('resume renders once per name', () => {
  const { au, calls, ctx } = setup();
  au.resume(); au.resume();
  assert.deepEqual(calls, { blip: 1, siren0: 1 });
  assert.equal(au.live, true);
  assert.equal(au.play('blip', { gain: 0.5, rate: 2 }), true);
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].playbackRate.value, 2);
  assert.equal(au.play('nope'), false);
});

test('master gain is volume x desktop gain; setVolume clamps', () => {
  const { au, ctx } = setup({ volume: 0.8, desktopGain: 0.5 });
  au.resume();
  const master = () => ctx.gains[0].gain.value;
  assert.ok(Math.abs(master() - 0.4) < 1e-9);
  au.setVolume(7);
  assert.equal(master(), 0.5);
  au.setDesktopGain(0);
  assert.equal(master(), 0);
});

test('loop starts one source and stops it', () => {
  const { au, ctx } = setup();
  au.resume();
  au.loop('siren0', true); au.loop('siren0', true);
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].loop, true);
  au.loop('siren0', false);
  assert.equal(ctx.sources[0].stopped, 1);
});

test('silence stops everything', () => {
  const { au, ctx } = setup();
  au.resume();
  au.play('blip'); au.loop('siren0', true);
  au.silence();
  assert.ok(ctx.sources.every((s) => s.stopped >= 1));
});

test('a throwing context sets lastError', () => {
  const { au, ctx } = setup();
  au.resume();
  ctx.failSource = true;
  assert.equal(au.play('blip'), false);
  assert.ok(au.lastError instanceof Error);
});

test('close closes the context once', () => {
  const { au, ctx } = setup();
  au.resume();
  au.close(); au.close();
  assert.equal(ctx.closed, 1);
  assert.equal(au.play('blip'), false);
});
