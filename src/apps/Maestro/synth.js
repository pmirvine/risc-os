// Web Audio synthesis of the RISC OS 3.71 sound voices used by Maestro, and a look-ahead
// scheduler (the Sound scheduler / Sound_QSchedule equivalent).
//
// Voice numbers follow the 3.71 ROM installation order (*Voices):
//   1 WaveSynth-Beep  2 StringLib-Soft  3 StringLib-Pluck  4 StringLib-Steel  5 StringLib-Hard
//   6 Percussion-Soft 7 Percussion-Medium 8 Percussion-Snare 9 Percussion-Noise
// StringLib voices use Karplus-Strong plucked strings (the StringLib module is a physical string
// model too); WaveSynth-Beep is a wavetable tone; percussion is noise/pitch-drop based.

export const VOICES = ['WaveSynth-Beep', 'StringLib-Soft', 'StringLib-Pluck', 'StringLib-Steel', 'StringLib-Hard', 'Percussion-Soft', 'Percussion-Medium', 'Percussion-Snare', 'Percussion-Noise'];

let ctx = null, master = null;
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
/** Overall volume (Sound_Volume 0..127). */
export function setMasterVolume(v) { audio(); master.gain.setTargetAtTime(Math.pow(10, (v - 127) * 0.375 / 20) * 0.9, ctx.currentTime, 0.02); }

const ksCache = new Map();
/** Karplus-Strong string sample for a MIDI note. */
function stringBuffer(voice, midi) {
  const key = voice + ':' + Math.round(midi * 4);
  if (ksCache.has(key)) return ksCache.get(key);
  const sr = ctx.sampleRate;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const P = { 2: { len: 2.2, damp: 0.994, bright: 0.25 }, 3: { len: 1.6, damp: 0.990, bright: 0.6 }, 4: { len: 3.0, damp: 0.998, bright: 0.9 }, 5: { len: 1.2, damp: 0.985, bright: 1 } }[voice] ?? { len: 2, damp: 0.994, bright: 0.4 };
  const n = Math.floor(sr * P.len);
  const buf = ctx.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const period = sr / f;
  const N = Math.max(2, Math.floor(period));
  const frac = period - N;
  const line = new Float32Array(N + 2);
  // excitation: noise low-passed according to brightness
  let lp = 0;
  for (let i = 0; i < line.length; i++) { const r = Math.random() * 2 - 1; lp += (r - lp) * (0.15 + 0.85 * P.bright); line[i] = lp; }
  let mean = 0; for (let i = 0; i < line.length; i++) mean += line[i]; mean /= line.length;
  for (let i = 0; i < line.length; i++) line[i] -= mean;
  // higher notes decay faster, like real strings
  const damp = Math.pow(P.damp, Math.max(0.6, f / 220) * 0.9);
  let idx = 0, prev = 0;
  const L = line.length - 1;
  for (let i = 0; i < n; i++) {
    const a = line[idx], b = line[(idx + 1) % L];
    const v = a + (b - a) * frac;
    out[i] = v;
    const nv = damp * 0.5 * (v + prev);
    prev = v;
    line[idx] = nv;
    idx = (idx + 1) % L;
  }
  let peak = 0; for (let i = 0; i < Math.min(n, 4000); i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  ksCache.set(key, buf);
  if (ksCache.size > 400) ksCache.delete(ksCache.keys().next().value);
  return buf;
}

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
let beepWave = null;

/**
 * Play one note. ev: {midi, dur (s), amp (0..127 log), voice, pan (-1..1)}; t = audio time.
 * Returns the nodes (so they can be stopped).
 */
export function playNote(ev, t) {
  audio();
  const gain = Math.pow(10, (ev.amp - 127) * 0.375 / 20) * 0.28;
  const g = ctx.createGain();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { pan.pan.value = Math.max(-1, Math.min(1, ev.pan ?? 0)); g.connect(pan); pan.connect(master); } else g.connect(master);
  const f = 440 * Math.pow(2, (ev.midi - 69) / 12);
  const dur = Math.max(0.03, ev.dur);
  const nodes = [];
  const v = ev.voice;
  const env = (a, peak, end, rel) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, Math.max(t + a, end));
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + a, end) + rel);
    return Math.max(t + a, end) + rel + 0.02;
  };
  if (v >= 2 && v <= 5) {
    const src = ctx.createBufferSource();
    src.buffer = stringBuffer(v, ev.midi);
    src.connect(g);
    const stop = env(0.002, gain * 1.3, t + dur, v === 4 ? 0.25 : 0.12);
    src.start(t); src.stop(Math.min(stop, t + src.buffer.duration));
    nodes.push(src);
  } else if (v === 6 || v === 7) {
    // soft/medium drums: pitch-drop sine with a click
    const o = ctx.createOscillator();
    o.type = 'sine';
    const base = v === 6 ? 90 + (ev.midi - 48) * 1.5 : 180 + (ev.midi - 48) * 3;
    o.frequency.setValueAtTime(Math.max(40, base * 1.8), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, base), t + 0.08);
    o.connect(g);
    const stop = env(0.001, gain * 1.6, t + 0.01, v === 6 ? 0.35 : 0.22);
    o.start(t); o.stop(stop);
    nodes.push(o);
  } else if (v === 8 || v === 9) {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const bp = ctx.createBiquadFilter();
    bp.type = v === 8 ? 'bandpass' : 'highpass';
    bp.frequency.value = v === 8 ? 1800 + (ev.midi - 60) * 20 : 3000;
    bp.Q.value = v === 8 ? 0.8 : 0.5;
    src.connect(bp); bp.connect(g);
    const stop = env(0.001, gain * (v === 8 ? 2.2 : 1.4), t + 0.01, v === 8 ? 0.18 : Math.min(0.5, dur));
    src.start(t, Math.random() * 0.5); src.stop(stop);
    nodes.push(src);
    if (v === 8) {
      const o = ctx.createOscillator(); o.frequency.value = 190; o.type = 'triangle';
      const og = ctx.createGain(); og.gain.setValueAtTime(gain, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(og); og.connect(pan ?? master); o.start(t); o.stop(t + 0.12); nodes.push(o);
    }
  } else {
    // WaveSynth-Beep: a soft wavetable tone
    if (!beepWave) beepWave = ctx.createPeriodicWave(new Float32Array([0, 1, 0.45, 0.25, 0.12, 0.06, 0.03]), new Float32Array(7));
    const o = ctx.createOscillator();
    o.setPeriodicWave(beepWave);
    o.frequency.value = f;
    o.connect(g);
    const stop = env(0.004, gain * 0.9, t + dur - 0.02, 0.06);
    o.start(t); o.stop(stop);
    nodes.push(o);
  }
  return nodes;
}

/** Look-ahead scheduler playing a list of events ({time, ...}) from `from` seconds. */
export class Player {
  constructor() { this.playing = false; this.timer = null; this.nodes = []; }
  play(events, { from = 0, onEnd, length } = {}) {
    this.stop();
    const ac = audio();
    if (!ac) return false;
    this.events = [...events].sort((a, b) => a.time - b.time);
    this.i = this.events.findIndex((e) => e.time >= from - 1e-6);
    if (this.i < 0) this.i = this.events.length;
    this.t0 = ac.currentTime + 0.12 - from;
    this.length = length ?? this.events.reduce((m, e) => Math.max(m, e.time + e.dur), 0);
    this.playing = true;
    this.onEnd = onEnd;
    const tick = () => {
      const now = ac.currentTime;
      while (this.i < this.events.length && this.t0 + this.events[this.i].time < now + 0.6) {
        const e = this.events[this.i++];
        const at = this.t0 + e.time;
        if (at >= now - 0.05) this.nodes.push(...playNote(e, Math.max(at, now)));
      }
      if (this.nodes.length > 600) this.nodes.splice(0, this.nodes.length - 300);
      if (this.i >= this.events.length && now > this.t0 + this.length + 0.3) { this.stop(); this.onEnd?.(); }
    };
    tick();
    this.timer = setInterval(tick, 100);
    return true;
  }
  /** Current position in seconds. */
  get position() { return this.playing ? audio().currentTime - this.t0 : 0; }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.playing && ctx) {
      const now = ctx.currentTime;
      for (const n of this.nodes) { try { n.stop(now + 0.01); } catch { /* */ } }
    }
    this.nodes = [];
    this.playing = false;
  }
}
