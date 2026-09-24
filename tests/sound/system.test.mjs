// Level0/1/2 semantics: SOUND (OS_Word 7 / Sound_Control), channels and VOICES, stereo and the
// 16-bit mix, the scheduler (Sound_QSchedule, QTempo, QBeat) and VDU 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWI, imageOf } from '../../src/core/sound/system.js';
import { bellBlock } from '../../src/core/sound/index.js';
import { SoundOutput } from '../../src/core/sound/output.js';
import { fresh, render, peak } from './helpers.mjs';

const ACTIVE = 8, F = 208;

test('power-on: one channel, 48us, 208 samples, volume &7F, tempo &1000, beat counter off', () => {
  const s = fresh();
  assert.deepEqual(s.swi(SWI.Sound_Configure, [0, 0, 0, 0, 0]).slice(0, 3), [1, 208, 48]);
  assert.equal(s.volume(0), 127);
  assert.equal(s.qTempoSWI(0), 0x1000);
  assert.equal(s.qBeatSWI(-1), 0);
  assert.equal(s.enable(0), 2);
});

test('SOUND semantics: channel low nibble only, amplitude forms, duration x5, 255 = forever, 0 = unchanged', () => {
  const s = fresh();
  s.control(0x1011, -15, 53, 4);                   // H, S and flush bits are ignored: channel 1
  assert.equal(s.chan[0].ampGate, 0x7F);
  assert.equal(s.chan[0].duration, 20);
  assert.equal(s.chan[0].flags & 0x40, 0x40);      // gate on pending
  s.control(1, -1, 53, 0);
  assert.equal(s.chan[0].ampGate, 0x47);           // ((-1-1)&15)<<2 ^ &7F
  assert.equal(s.chan[0].duration, 20);            // 0 leaves the duration
  s.control(1, 0x155, 53, 255);
  assert.equal(s.chan[0].ampGate, 0x55);
  assert.equal(s.chan[0].duration, 0x0FFFFFFF * 5);
  s.control(1, 0x1C0, 53, 1);
  assert.equal(s.chan[0].flags & 0xE0, 0x20);      // &180+: smooth update
  s.control(1, 0, 53, 1);
  assert.equal(s.chan[0].flags & 0xE0, 0xC0);      // amplitude 0: gate off then gate on (silent)
  const before = { ...s.chan[0] };
  s.control(1, 3, 53, 1);                          // envelope numbers are ignored (OS_Word 8 is unused)
  s.control(1, 0x234, 53, 1);                      // unknown amplitude forms too
  s.control(9, -15, 53, 1);                        // and channels 9-15
  assert.deepEqual({ ...s.chan[0] }, before);
});

test('OS_Word 7 / Sound_ControlPacked unpacks 16-bit fields (amplitude sign-extended)', () => {
  const s = fresh();
  s.controlPacked(((-13 & 0xFFFF) << 16) | 1, (6 << 16) | 100);
  assert.equal(s.chan[0].ampGate, 0x77);
  assert.equal(s.chan[0].duration, 30);
});

test('only the first VOICES channels are filled; channels default to WaveSynth-Beep', () => {
  const s = fresh();
  s.control(2, -15, 53, 10);
  let r = render(s, 10, 2);
  assert.equal(peak(r.L), 0);                      // 1 channel configured: channel 2 is not played
  s.configure(2);
  s.control(2, -15, 53, 10);
  r = render(s, 10, 2);
  assert.ok(peak(r.ch) > 3000);
  assert.equal(s.configure(3)[0], 2);              // 3 rounds up to 4
  assert.equal(s.nchan, 4);
  assert.equal(s.configure(8)[0], 4);
});

test('the 16-bit mix: 7 stereo positions, *11 / (8 x channels)', () => {
  // ConvImages: (position + &90) >> 5, clamped to 1..7 (so -127..-81 is full left, -16..15 centre)
  assert.deepEqual([-127, -81, -80, -49, -48, -17, -16, 15, 16, 47, 48, 79, 80, 127].map((p) => imageOf(p + 0x80)),
    [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
  const run = (setup) => { const s = fresh(); setup(s); s.control(1, -15, 53, 255); return { s, r: render(s, 12) }; };
  // centre at the envelope peak: 3 x 3952 x 11 / 8 = 16302 on both sides
  const c = run(() => {});
  const full = 3 * 3952 * 11 / 8 / 32768;
  assert.ok(Math.abs(peak(c.r.L, 5 * F, 6 * F) - full) < 0.002);
  assert.deepEqual(Array.from(c.r.L), Array.from(c.r.R));
  // full left: weight 6 on the left, nothing on the right
  const l = run((s) => s.stereo(1, -127));
  assert.equal(peak(l.r.R), 0);
  for (let i = 0; i < l.r.L.length; i++) assert.ok(Math.abs(l.r.L[i] - 2 * c.r.L[i]) < 2 / 32768);
  // 67% right: 2/6 left, 4/6 right
  const r67 = run((s) => s.stereo(1, 32));
  for (let i = 0; i < r67.r.L.length; i += 7) assert.ok(Math.abs(r67.r.R[i] - 2 * r67.r.L[i]) < 3 / 32768);
  assert.equal(l.s.stereo(1, -128), -127);          // -128 reads
  assert.equal(l.s.stereo(9, 0), -128);             // bad channel
  // two channels: each is mixed at half the level (*11 >> 4 instead of >> 3)
  const two = run((s) => s.configure(2));
  for (let i = 0; i < two.r.L.length; i++) assert.ok(Math.abs(two.r.L[i] - c.r.L[i] / 2) < 2 / 32768);
  const s = two.s;
  // Stereo programs every Nth image position: with 2 channels, channel 2 sets positions 2, 4, 6, 8
  s.stereo(2, 127);
  assert.deepEqual(Array.from(s.images).map((b) => b - 128), [0, 127, 0, 127, 0, 127, 0, 127]);
});

test('Sound_Volume scales everything, Sound_Enable off stops the sound interrupt, *Speaker OFF mutes', () => {
  const s = fresh();
  s.control(1, -15, 53, 255);
  const a = peak(render(s, 12).L);
  s.volume(64);
  const b = peak(render(s, 3).L);
  assert.ok(b < a / 10);
  s.volume(127);
  s.enable(1);
  const fills = s.fills;
  const t = s.qTempoSWI(0);
  assert.equal(peak(render(s, 5).L), 0);
  assert.equal(s.enable(2), 1);
  s.speaker(1);
  assert.equal(peak(render(s, 3).L), 0);
  s.speaker(2);
  assert.ok(peak(render(s, 3).L) > 0);
  assert.ok(s.fills > fills && t === 0x1000);
});

test('Sound_QSchedule: SOUND ...,beat plays on the scheduler tick; tempo &1000 = 1 tick per buffer', () => {
  const s = fresh();
  assert.equal(s.qSchedule(10, 0, ((-15 & 0xFFFF) << 16) | 1, (5 << 16) | 53), 0);
  assert.equal(s.qDepth, 1);
  const r = render(s, 20);
  // each dispatch runs the current slot and the next (SoundQRemove), so tick t plays in fill t-1
  const on = r.flags.findIndex((f) => f & ACTIVE);
  assert.equal(on, 9);
  assert.equal(s.qDepth, 0);
  // tempo &800: half a tick per buffer
  const t = fresh();
  t.qTempoSWI(0x800);
  t.qSchedule(10, 0, ((-15 & 0xFFFF) << 16) | 1, (5 << 16) | 53);
  const r2 = render(t, 30);
  const on2 = r2.flags.findIndex((f) => f & ACTIVE);
  assert.ok(on2 >= 18 && on2 <= 20, `at half tempo: fill ${on2}`);
  // a negative time means "with the last event"; SWIs can be scheduled
  const u = fresh();
  u.qSchedule(5, 0, 1 | (0x17F << 16), 53 | (2 << 16));
  u.qSchedule(-1, 0x0F000000 | SWI.Sound_QTempo, 0x2000, 0);
  render(u, 8);
  assert.equal(u.qTempoSWI(0), 0x2000);
  // the queue: 445 16-byte elements; Sound_QFree is pessimistic (111 slots)
  const v = fresh();
  assert.equal(v.qFree(), 111);
  let n = 0;
  while (v.qSchedule(n, 0, 1, 1) === 0) n++;
  assert.equal(n, 148);                             // 3 elements for each new time
  assert.equal(v.qInit(), 0);
  assert.equal(v.qDepth, 0);
});

test('Sound_QBeat: the bar counter counts ticks, wraps at the bar length, and times are relative to beat 0', () => {
  const s = fresh();
  assert.equal(s.qBeatSWI(100), 0);
  render(s, 30);
  assert.equal(s.qBeatSWI(0), 30);
  render(s, 80);
  assert.equal(s.qBeatSWI(0), 10);                  // wrapped at 100
  let wraps = 0;
  s.eventHandlers.add(() => wraps++);
  render(s, 100);
  assert.equal(wraps, 1);
  // SOUND ...,50 at beat 10 plays 40 ticks later
  s.qSchedule(50, 0, 1 | ((-15 & 0xFFFF) << 16), 53 | (1 << 16));
  const r = render(s, 50);
  const on = r.flags.findIndex((f) => f & ACTIVE);
  assert.ok(on === 39 || on === 40, `fill ${on}`);
  assert.equal(s.qBeatSWI(-1), 100);
  assert.equal(s.qBeatSWI(-2), 100);                // disable: returns the old length, resets the beat
  assert.equal(s.qBeatSWI(0), 0);
});

test('VDU 7: the kernel bell settings make SOUND 1,-13,100,6 (Quiet CMOS: -5)', () => {
  const b = bellBlock({ channel: 1, info: 0x90, freq: 100, dur: 6 });
  assert.deepEqual([b.channel, b.amplitude, b.pitch, b.duration], [1, -13, 100, 6]);
  assert.equal(bellBlock({ channel: 1, info: 0xD0, freq: 100, dur: 6 }).amplitude, -5);
  // H and S bits go to the channel's high byte: &HFSC
  assert.equal((bellBlock({ channel: 2, info: 0x90 | 4 | 1, freq: 1, dur: 1 }).r0 >> 8) & 0xFF, 0x11);
  const s = fresh();
  s.controlPacked(b.r0, b.r1);
  const r = render(s, 40);
  const end = r.flags.findIndex((f, k) => k > 1 && !(f & ACTIVE));
  assert.ok(end >= 30 && end <= 36, `6/20 s plus the release: ${end}`);
  assert.ok(Math.abs(peak(r.ch, 5 * F, 8 * F) - 2928) <= 150);  // &FE - 2 x 8 at the envelope peak
});

test('escape: Sound_QInit and SOUND c,&101,0,1 on every channel silences everything', () => {
  const s = fresh();
  s.configure(4);
  for (let c = 1; c <= 4; c++) s.control(c, -15, 53 + c * 4, 255);
  s.qSchedule(20, 0, 1, 1);
  render(s, 10);
  s.qInit(); s.hush();
  const r = render(s, 20);
  assert.equal(s.qDepth, 0);
  assert.ok(peak(r.L, 10 * F) === 0);
});

test('the clock: without Web Audio, sync() runs fills up to the wall clock', async () => {
  const s = fresh();
  const out = new SoundOutput(s, { audio: false });
  s.qBeatSWI(1000);
  const f0 = s.fills;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(s.fills, f0);                        // nothing runs by itself...
  const b = s.qBeatSWI(0);                          // ...until something asks (commands sync first)
  assert.ok(b >= 9 && b <= 16, `beat ${b} after 120 ms`);
  assert.equal(out.playing, false);
});
