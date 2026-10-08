import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDef, loopify, normalise, levels, echo, fadeOut, vidc8,
  filter } from '../../tools/games/!GameLib/SynthFx';
import { Synth } from '../../tools/games/!GameLib/Synth';
import * as L2 from '../../tools/lander2/!Lander2/SfxKit';
import { SET } from '../../tools/lander2/!Lander2/SfxOrig';

test('renderDef matches Lander II', () => {
  const defs = [...Object.values(SET.sounds), ...Object.values(SET.loops)];
  assert.ok(defs.length > 10);
  defs.forEach((def, i) => {
    assert.deepEqual(renderDef(SET, def, i), L2.renderDef(SET, def, i));
  });
});

test('loopify shortens by round(seconds x rate)', () => {
  const a = new Float32Array(1000).fill(0.5);
  assert.equal(loopify(a, 8000, 0.0333).length, 1000 - Math.round(266.4));
});

test('normalise keeps the peak at or under 0.89', () => {
  const k = new Synth(8000, 5), a = k.buffer(0.3);
  k.tone(a, { wave: 'saw', freq: 300 });
  normalise(a, 8000, -3);
  assert.ok(Math.max(...a.map(Math.abs)) <= 0.89 + 1e-6);
  assert.ok(levels(a, 8000).seconds > 0.29);
});

test('echo, fadeOut, vidc8, filter behave', () => {
  const a = new Float32Array(100); a[0] = 1;
  echo(a, 100, 0.1, 0.5);
  assert.equal(a[10], 1);
  const b = new Float32Array(10).fill(1);
  fadeOut(b, 10, 0.5);
  assert.equal(b[9], 0);
  assert.equal(b[0], 1);
  const c = Float32Array.from([0, 0.5, -0.5, 1]);
  vidc8(c);
  assert.ok(c[1] > 0.4 && c[1] < 0.6 && c[2] === -c[1]);
  assert.equal(filter(new Float32Array(10), 8000, 'lp', 500).length, 10);
});
