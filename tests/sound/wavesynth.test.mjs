// WaveSynth-Beep: the ROM wavetable, the envelope descriptors (attack, decay, sustain, release)
// and the log-domain amplitude, checked against the table data in WaveSynth/s/WaveSynth.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beepWavetable, BEEP_DESCRIPTORS, WaveSynthVoice, wavetableName } from '../../src/core/sound/wavesynth.js';
import { LOG_TO_LINEAR, SAMPLE_RATE, pitchToInc } from '../../src/core/sound/tables.js';
import { fresh, render, peak, period } from './helpers.mjs';

const ACTIVE = 8;

test('the Beep wavetable image: header, descriptors, one 256-byte log sine cycle', () => {
  const t = beepWavetable();
  const w = new DataView(t.buffer);
  assert.equal(String.fromCharCode(...t.slice(0, 4)), '!WT:');
  assert.equal(wavetableName(t), 'Beep');
  assert.equal(w.getUint32(16, true), 512);
  for (let i = 5; i <= 12; i++) assert.equal(w.getUint32(i * 4, true), 8);    // all pitches start at ATTACK
  assert.equal(w.getUint32(52, true), 13);                                    // release descriptor
  for (const [n, [a, b]] of Object.entries(BEEP_DESCRIPTORS)) {
    assert.equal(w.getUint32(n * 8, true), a >>> 0);
    assert.equal(w.getUint32(n * 8 + 4, true), b >>> 0);
  }
  const seg = t.slice(256, 512);
  // positive half cycle then its mirror with the sign bit set
  for (let i = 0; i < 128; i++) {
    assert.equal(seg[i] & 1, 0);
    assert.equal(seg[128 + i], seg[i] | 1);
    assert.equal(seg[i], seg[127 - i]);
  }
  assert.equal(seg[0], 0x40); assert.equal(seg[64], 0xFE);
  // decoded it is (very nearly) a sine wave
  let dot = 0, e1 = 0, e2 = 0;
  for (let i = 0; i < 256; i++) {
    const v = LOG_TO_LINEAR[seg[i]], s = Math.sin(2 * Math.PI * (i + 0.5) / 256);
    dot += v * s; e1 += v * v; e2 += s * s;
  }
  assert.ok(dot / Math.sqrt(e1 * e2) > 0.99, `correlation ${dot / Math.sqrt(e1 * e2)}`);
});

test('samples are table bytes minus 2 x (note attenuation + envelope attenuation), clamped at 0', () => {
  const sys = fresh();
  const T = beepWavetable();
  sys.control(1, -15, 53, 255);
  for (let k = 0; k < 40; k++) sys.fill();                      // into the slow sustain ramp
  const c = sys.chan[0];
  const inc = c.pitch & 0xFFFF;
  let ph = c.pitch >>> 16;
  const r7 = c.p3;
  sys.fill();
  const b = sys.bufs[0][sys.fills & 1];
  for (let i = 0; i < 208; i++) {
    const idx = ph >>> 8;
    const ok = [r7, r7 - 1].some((a) => b[i] === Math.max(0, T[256 + idx] - 2 * (127 - a)));
    assert.ok(ok, `sample ${i}: ${b[i]} vs table ${T[256 + idx]} at amplitude ${r7}`);
    ph = (ph + inc) & 0xFFFF;
  }
  assert.equal(inc, pitchToInc(53));
});

test('envelope: attack +1 every 8 samples, decay to &70 at 1 per 128 samples, then 1 per 2004 samples to silence', () => {
  const sys = fresh();
  sys.control(1, -15, 53, 255);                                  // duration forever: the envelope ends it
  const { amp, ch, flags } = render(sys, 1200);
  // a step every other group of 4 samples: 26 in the first fill's 52 groups; each later fill
  // counts 53 (Fill0's count runs once more at the buffer boundary, before FillDone)
  assert.deepEqual(amp.slice(0, 4), [26, 53, 79, 106]);
  const top = amp.indexOf(127);
  assert.ok(top === 4 || top === 5, `attack reaches 127 in the 5th fill (${top})`);
  // decay: 15 steps of 32 groups (1920 samples, 9.2 fills) to &70
  const at70 = amp.indexOf(112);
  assert.ok(at70 >= 13 && at70 <= 15, `decay reaches &70 at fill ${at70}`);
  // sustain ramp: 501 groups (2004 samples) per step
  const perStep = (amp[at70 + 480] - amp[at70 + 20]) / 460;
  assert.ok(Math.abs(perStep + 208 / 2004) < 0.01, `sustain slope ${perStep} per fill`);
  // then the dead descriptor ends the note: 112 steps * 2004 samples after the decay (~10.9 s in all)
  const end = flags.findIndex((f, k) => k > 20 && !(f & ACTIVE));
  const secs = end * 208 / SAMPLE_RATE;
  assert.ok(secs > 10.7 && secs < 11.1, `note ends after ${secs} s`);
  // the output level follows the amplitude register (peak of the log sine = &FE - 2 x attenuation)
  for (const k of [2, 6, 30, 300, 800]) {
    const p = peak(ch, k * 208, (k + 1) * 208);
    const a0 = Math.min(amp[k - 1], amp[k]), a1 = Math.max(amp[k - 1], amp[k]);
    const lo = LOG_TO_LINEAR[0xFE - 2 * (127 - a0 + 1)], hi = LOG_TO_LINEAR[0xFE - 2 * (127 - a1)];
    assert.ok(p >= lo && p <= hi, `fill ${k}: peak ${p} in [${lo}, ${hi}]`);
  }
  // pitch: 65536 / 813 = 80.6 samples per cycle (258.4 Hz)
  const per = period(ch, 20 * 208, 40 * 208, 40, 200);
  assert.ok(Math.abs(per.lag - 65536 / 813) < 0.3, `period ${per.lag}`);
});

test('duration end: release ramp of 1 per 8 samples from the current amplitude, at a zero crossing', () => {
  const sys = fresh();
  sys.control(1, -15, 53, 10);                                   // 10/20 s = 50 fills
  const { amp, flags, ch } = render(sys, 70);
  assert.ok(flags[48] & ACTIVE);
  assert.ok(amp[49] > 100);
  const quiet = flags.findIndex((f) => !(f & ACTIVE));
  assert.ok(quiet >= 50 && quiet <= 56, `silent after the ~${amp[49]}*8-sample release (${quiet})`);
  assert.ok(peak(ch, 51 * 208, 52 * 208) < peak(ch, 48 * 208, 49 * 208));
  assert.equal(peak(ch, 60 * 208, 70 * 208), 0);
});

test('amplitude is applied in the log domain (-15 .. -1, &100-&17F) and scaled by Sound_Volume', () => {
  const level = (amp, vol = 127) => {
    const sys = fresh({ volume: vol });
    sys.control(1, amp, 53, 255);
    const { ch } = render(sys, 8);
    return peak(ch, 5 * 208, 8 * 208);
  };
  assert.equal(level(-15), 3952);                                 // full scale at the envelope peak
  assert.equal(level(0x17F), 3952);
  assert.equal(level(-7), LOG_TO_LINEAR[0xFE - 64]);              // 8 steps of 4 log units quieter
  assert.equal(level(-13), LOG_TO_LINEAR[0xFE - 16]);             // the loud beep: &77
  assert.equal(level(0x140), LOG_TO_LINEAR[0xFE - 126]);
  assert.equal(level(-15, 100), LOG_TO_LINEAR[0xFE - 54]);        // *Volume 100: 27 steps down
  assert.equal(level(0), 0);                                      // amplitude 0 is silent
});

test('a new SOUND on a sounding channel restarts the attack; &180+ is a smooth update', () => {
  const sys = fresh();
  sys.control(1, -15, 53, 255);
  for (let k = 0; k < 20; k++) sys.fill();
  const phase = sys.chan[0].pitch >>> 16;
  sys.control(1, 0x1FF, 89, 0);                                   // smooth update: new pitch, keep phase and envelope
  assert.equal(sys.chan[0].pitch >>> 16, phase);
  const before = sys.chan[0].p3;
  sys.fill();
  assert.ok(Math.abs(sys.chan[0].p3 - before) <= 1);
  assert.equal(sys.chan[0].pitch & 0xFFFF, pitchToInc(89));
  sys.control(1, -15, 53, 255);                                   // gate on: attack from 0 again
  sys.fill();
  assert.equal(sys.chan[0].p3, 26);
});

test('loading a !WT: wavetable (the !BrassOrgn Organ01) makes another WaveSynth voice', { skip: !fs.existsSync('vendor/ro371/Sources/OS_Core/HWSupport/Sound/Voices/WaveSynth/!BrassOrgn/Organ01') }, () => {
  const t = new Uint8Array(fs.readFileSync('vendor/ro371/Sources/OS_Core/HWSupport/Sound/Voices/WaveSynth/!BrassOrgn/Organ01'));
  const v = new WaveSynthVoice(t);
  assert.equal(v.name, 'WaveSynth-Organ');
  const sys = fresh();
  const n = sys.installVoice(v);
  assert.equal(n, 10);
  sys.attachVoice(1, n);
  sys.control(1, -15, 53, 20);
  const { ch } = render(sys, 40);
  assert.ok(peak(ch, 5 * 208, 30 * 208) > 1000);
});
