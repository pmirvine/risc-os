// The Web Audio output: fills are resampled continuously and scheduled frame-exactly (no gaps,
// overlaps or clicks between buffers), the renderer stops when everything is quiet, and it
// skips ahead instead of scheduling into the past after a stall. Uses a fake AudioContext.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundOutput } from '../../src/core/sound/output.js';
import { fresh } from './helpers.mjs';

class FakeContext {
  constructor() { this.sampleRate = 48000; this.currentTime = 0; this.state = 'running'; this.destination = {}; this.sources = []; FakeContext.last = this; }
  createGain() { return { gain: { value: 1 }, connect() {} }; }
  createBuffer(n, length, sampleRate) {
    const d = Array.from({ length: n }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: n, getChannelData: (i) => d[i] };
  }
  createBufferSource() {
    const s = { buffer: null, connect() {}, stop() {}, start: (t) => { s.when = t; this.sources.push(s); } };
    return s;
  }
  resume() { return Promise.resolve(); }
}

/** Drive the renderer for `secs` in 25 ms ticks of the fake audio clock. */
function run(out, ctx, secs) {
  for (let t = 0; t < secs; t += 0.025) { ctx.currentTime += 0.025; if (out.playing) out._tick(); }
}

test('a note is rendered as frame-contiguous buffers that join without clicks', () => {
  const sys = fresh();
  const out = new SoundOutput(sys, { AudioContext: FakeContext });
  sys.control(1, -15, 53, 20);                       // 1 s beep: wakes the renderer
  const ctx = FakeContext.last;
  assert.ok(out.playing);
  run(out, ctx, 1.6);
  const src = ctx.sources.slice().sort((a, b) => a.when - b.when);
  assert.ok(src.length > 20);
  const sr = ctx.sampleRate;
  for (let i = 1; i < src.length; i++) {
    const end = Math.round(src[i - 1].when * sr) + src[i - 1].buffer.length;
    if (i < src.length - 1) assert.equal(Math.round(src[i].when * sr), end, `buffer ${i} starts where ${i - 1} ends`);
  }
  // join them and look at the waveform
  const n = src.reduce((a, s) => a + s.buffer.length, 0);
  const L = new Float32Array(n);
  let o = 0;
  for (const s of src) { L.set(s.buffer.getChannelData(0), o); o += s.buffer.length; }
  let maxStep = 0;
  for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(L[i] - L[i - 1]));
  // a 258 Hz sine of amplitude 0.5 moves at most 2*pi*258*0.5/48000 = 0.017 per sample
  assert.ok(maxStep < 0.025, `largest step ${maxStep}`);
  let zc = 0;
  const a = Math.round(0.2 * sr), b = Math.round(0.8 * sr);
  for (let i = a + 1; i < b; i++) if ((L[i - 1] < 0) !== (L[i] < 0)) zc++;
  const f = zc / 2 / ((b - a) / sr);
  assert.ok(Math.abs(f - 258.45) < 2, `frequency ${f}`);
  assert.equal(out.playing, false, 'stops when quiet');
});

test('after a stall the renderer skips ahead rather than scheduling in the past', () => {
  const sys = fresh();
  const out = new SoundOutput(sys, { AudioContext: FakeContext });
  sys.control(1, -15, 53, 100);
  const ctx = FakeContext.last;
  run(out, ctx, 0.2);
  const fills = sys.fills;
  ctx.currentTime += 0.5;                            // the main thread was busy for 0.5 s
  const before = ctx.sources.length;
  out._tick();
  assert.ok(sys.fills - fills >= 50, 'the missed fills were run');
  for (const s of ctx.sources.slice(before)) assert.ok(s.when >= ctx.currentTime);
  out._stop();
});
