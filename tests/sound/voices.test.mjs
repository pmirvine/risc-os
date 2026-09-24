// StringLib (Soft, Pluck, Steel, Hard) and Percussion (Soft, Medium, Snare, Noise): the
// plucked-string engine of StringLib/s/StringLib and Percussion/s/Percussion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchToInc } from '../../src/core/sound/tables.js';
import { fresh, render, peak, rms, period } from './helpers.mjs';

const ACTIVE = 8;
const NAMES = ['WaveSynth-Beep', 'StringLib-Soft', 'StringLib-Pluck', 'StringLib-Steel', 'StringLib-Hard',
  'Percussion-Soft', 'Percussion-Medium', 'Percussion-Snare', 'Percussion-Noise'];

/** Play voice v on channel 1 for n fills. */
function play(v, { amp = -15, pitch = 53, dur = 20, n = 130 } = {}) {
  const sys = fresh();
  sys.attachVoice(1, v);
  sys.control(1, amp, pitch, dur);
  return { sys, ...render(sys, n) };
}
/** High-frequency content: RMS of the first difference relative to the RMS. */
function brightness(a, from, to) {
  let d = 0, e = 0;
  for (let i = from + 1; i < to; i++) { d += (a[i] - a[i - 1]) ** 2; e += a[i] * a[i]; }
  return Math.sqrt(d / (e || 1));
}
const F = 208;

test('voices install in 3.71 ROM order: 1 WaveSynth-Beep, 2-5 StringLib, 6-9 Percussion', () => {
  const sys = fresh();
  assert.deepEqual(sys.voices().map((v) => v.name), NAMES);
  assert.deepEqual(sys.voices().map((v) => v.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

for (let v = 2; v <= 5; v++) {
  test(`${NAMES[v - 1]}: muted first buffer, plays at the SOUND pitch, stops dead after the duration`, () => {
    const { ch, flags } = play(v);
    assert.equal(peak(ch, 0, F), 0);                              // Fill_RND3: mute the first buffer
    assert.ok(peak(ch, F, 5 * F) > 2000, 'non-silent');
    const p = period(ch, 10 * F, 30 * F, 20, 400);
    assert.ok(Math.abs(p.lag - 65536 / pitchToInc(53)) < 0.5 && p.corr > 0.8, `period ${p.lag} (${p.corr})`);
    // 20/20 s = 100 centiseconds on its own tempo accumulator (65536*4/208 per 4 samples)
    const q = flags.findIndex((f, k) => k > 1 && !(f & ACTIVE));
    assert.ok(q >= 100 && q <= 102, `stops at fill ${q}`);
    assert.ok(peak(ch, (q - 3) * F, (q - 1) * F) > 1000, 'still sounding just before the end (no release)');
    assert.equal(peak(ch, (q + 1) * F, 130 * F), 0);
    // the filter takes the harmonics away (Karplus-Strong on one 128-sample period)
    assert.ok(brightness(ch, 1 * F, 6 * F) > 1.5 * brightness(ch, 40 * F, 60 * F));
  });
}

test('StringLib: Soft filters hardest, Hard least; every note starts identically (seed &AAAAAAAA)', () => {
  const b = [2, 3, 4, 5].map((v) => brightness(play(v).ch, 20 * F, 40 * F));
  for (let i = 1; i < 4; i++) assert.ok(b[i] > b[i - 1], `brightness ${b}`);
  assert.deepEqual(Array.from(play(4).ch), Array.from(play(4).ch));
  // pitch follows SOUND
  const hi = play(4, { pitch: 101 });
  const p = period(hi.ch, 10 * F, 30 * F, 10, 200);
  assert.ok(Math.abs(p.lag - 65536 / pitchToInc(101)) < 0.3, `octave up: ${p.lag}`);
  // louder amplitude excites a larger string
  assert.ok(rms(play(4, { amp: -5 }).ch, 2 * F, 10 * F) < rms(play(4).ch, 2 * F, 10 * F) / 2);
});

test('StringLib duration is 12 bits of centiseconds: 255 ("forever") lasts 4091 cs', () => {
  const { flags } = play(2, { dur: 255, n: 4200 });
  const q = flags.findIndex((f, k) => k > 1 && !(f & ACTIVE));
  assert.ok(q >= 4090 && q <= 4094, `stops at fill ${q}`);
});

for (let v = 6; v <= 9; v++) {
  test(`${NAMES[v - 1]}: a noise burst at a fixed rate that decays`, () => {
    const a = play(v), b = play(v, { pitch: 150 });
    assert.equal(peak(a.ch, 0, F), 0);
    assert.ok(peak(a.ch, F, 3 * F) > 2000, 'non-silent');
    assert.deepEqual(Array.from(a.ch), Array.from(b.ch));         // the pitch is ignored (increment &100)
    assert.equal(a.sys.voiceTable[v].data(0).r[1] & 0xFFFF, 0x100);
    assert.ok(rms(a.ch, 40 * F, 60 * F) < rms(a.ch, 1 * F, 6 * F) / 3, 'decays');
    // noise, not a tone: no strong periodicity
    assert.ok(period(a.ch, 2 * F, 20 * F, 20, 400).corr < 0.5);
  });
}

test('Percussion: Soft dies fastest, Noise rings longest', () => {
  const tail = [6, 7, 8, 9].map((v) => { const { ch } = play(v); return rms(ch, 20 * F, 40 * F) / rms(ch, 1 * F, 6 * F); });
  for (let i = 1; i < 4; i++) assert.ok(tail[i] > tail[i - 1], `tail ratios ${tail}`);
});

test('VOICE c,"StringLib-Steel" attaches by name; unknown names are an error', () => {
  const sys = fresh();
  assert.equal(sys.attachNamedVoice(2, 'StringLib-Steel'), 4);
  assert.equal(sys.chan[1].voice, 4);
  assert.throws(() => sys.attachNamedVoice(2, 'Nonsense'), /Sound voice must be in the range 0-32/);
  assert.throws(() => sys.attachVoice(9, 1), /Channel number must be in the range 1-8/);
});
