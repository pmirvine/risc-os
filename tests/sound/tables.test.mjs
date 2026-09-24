// VIDC log <-> linear tables, the Level1 amplitude table and the pitch arithmetic
// (Sound0 convtable, Sound1 BuildLogTable / PitchTab / SoundShared).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOG_TO_LINEAR, LINEAR_MAX, SAMPLE_RATE, BUFFER_LEN, FILL_PERIOD, buildLogTable, buildAmpTable, amp7ToLinear32,
  pitchToInc, pitchToHz, bbcPitchTo15, PITCH_TAB, DEF_MASTER_PITCH,
} from '../../src/core/sound/tables.js';

test('default sample period: 48us, 20833 Hz, 208-sample buffers of 9.984 ms', () => {
  assert.equal(Math.round(SAMPLE_RATE * 1000) / 1000, 20833.333);
  assert.equal(BUFFER_LEN, 208);
  assert.equal(Math.round(FILL_PERIOD * 1e6), 9984);
});

test('log -> linear: the Sound0 convtable (sign in bit 0, 8 chords of 16 points)', () => {
  // the "direct linear equivalents of mu-law values" listed in Sound0
  const expect = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46,
    48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108,
  ];
  for (let m = 0; m < expect.length; m++) assert.equal(LOG_TO_LINEAR[m << 1], expect[m], `magnitude ${m}`);
  assert.equal(LOG_TO_LINEAR[0xFE], 3952);
  assert.equal(LOG_TO_LINEAR[0xFF], -3952);
  assert.equal(LINEAR_MAX, 3952);
  assert.equal(LOG_TO_LINEAR[112 << 1], 2032);             // start of the last chord
  for (let b = 2; b < 256; b += 2) {
    assert.equal(LOG_TO_LINEAR[b + 1], -LOG_TO_LINEAR[b]);  // odd = negative
    assert.ok(LOG_TO_LINEAR[b] > LOG_TO_LINEAR[b - 2]);     // monotonic
  }
});

test('linear -> log (BuildLogTable) inverts log -> linear at full volume', () => {
  const t = buildLogTable(127);
  assert.equal(t.length, 8192);
  assert.equal(t[0], 0);
  for (let m = 1; m < 127; m++) {
    const v = LOG_TO_LINEAR[m << 1];
    assert.equal(t[v], m << 1, `+${v}`);
    assert.equal(t[(8192 - v) & 8191], (m << 1) | 1, `-${v}`);
  }
  assert.equal(t[4095], 0xFE);                             // clamps at the top
  assert.equal(t[4096], 0xFF);
});

test('volume scales the log tables by 2 per step of attenuation', () => {
  const full = buildLogTable(127), half = buildLogTable(64);
  for (const i of [1, 17, 100, 1000, 4000, 8000]) assert.equal(half[i], Math.max(0, (full[i] & ~1) - 126) | (full[i] & 1));
  const amp = buildAmpTable(100);
  for (let i = 0; i < 256; i++) assert.equal(amp[i], Math.max(0, i - 54));
  assert.deepEqual(Array.from(buildAmpTable(127)), Array.from({ length: 256 }, (_, i) => i));
});

test('7-bit log amplitude -> 32-bit linear (StringLib/Percussion GateOn)', () => {
  for (let a = 0; a < 128; a++) {
    const v = amp7ToLinear32(a);
    // ((SSSS+16) x 2^CCC - 16) x 2^19: the linear value of log byte 2a, scaled to 31 bits
    assert.ok(Math.abs(v / 2 ** 19 - LOG_TO_LINEAR[a << 1]) < 1, `amp ${a}`);
  }
});

test('PitchTab is 2^30 * 2^(i/256)', () => {
  assert.equal(PITCH_TAB.length, 256);
  for (let i = 0; i < 256; i += 17) assert.ok(Math.abs(PITCH_TAB[i] / 2 ** 30 - 2 ** (i / 256)) < 1e-8);
});

test('BBC pitch: 48 steps per octave, 53 = &4000 (middle C)', () => {
  assert.equal(bbcPitchTo15(53), 0x4000);
  assert.equal(bbcPitchTo15(101), 0x5000);
  assert.equal(bbcPitchTo15(89), 0x4C00);
  assert.equal(bbcPitchTo15(54), 0x4055);                    // truncated BBCPitchInc16 arithmetic (4096/48 = 85.33)
  for (const p of [5, 53, 89, 100, 150, 200]) {
    const r = pitchToHz(p + 48) / pitchToHz(p);
    assert.ok(Math.abs(r - 2) < 0.006, `pitch ${p}: octave ratio ${r}`);
  }
  // one step is a quarter semitone
  const q = pitchToHz(89) / pitchToHz(88);
  assert.ok(Math.abs(q - 2 ** (1 / 48)) < 0.004, `step ratio ${q}`);
});

test('pitch 53 / &4000 at the default tuning (DefMasterPitch &6AB0)', () => {
  assert.equal(DEF_MASTER_PITCH, 0x6AB0);
  // The ARM tables give phase increment 813 (&32D): 813 * 20833.3 / 65536 = 258.45 Hz. The
  // DefMasterPitch comment in Sound1 claims 261.6 Hz ("66E >> 5"); the table arithmetic plays
  // middle C about 21 cents flat, as the real machine does at the 48us sample period.
  assert.equal(pitchToInc(53), 813);
  assert.equal(pitchToInc(0x4000), 813);
  const f = pitchToHz(53);
  assert.ok(Math.abs(f - 258.45) < 0.01, `${f}`);
  assert.ok(Math.abs(f / 261.63 - 1) < 0.013);               // within 1.3% (a quarter semitone) of 261.6
  assert.ok(Math.abs(pitchToHz(89) - 434.9) < 0.1);           // A
});

test('15-bit pitch: &1000 per octave, 12-bit fraction with 8 bits significant; >= &8000 is raw', () => {
  assert.equal(pitchToInc(0x5000), 2 * pitchToInc(0x4000));
  assert.equal(pitchToInc(0x3000), pitchToInc(0x4000) >> 1);
  const semi = pitchToHz(0x4000 + Math.round(4096 / 12)) / pitchToHz(0x4000);
  assert.ok(Math.abs(semi - 2 ** (1 / 12)) < 0.004, `semitone ${semi}`);
  assert.equal(pitchToInc(0x4000 + 15), pitchToInc(0x4000));   // bottom 4 bits of the fraction are ignored
  assert.equal(pitchToInc(0x4010), pitchToInc(0x4000) + 2);
  assert.equal(pitchToInc(0x8123), 0x8123);
  assert.equal(pitchToInc(0x1ABCD), 0xABCD);
  // tuning: +&1000 raises everything an octave
  assert.equal(pitchToInc(0x4000, DEF_MASTER_PITCH + 0x1000), 2 * pitchToInc(0x4000));
});
