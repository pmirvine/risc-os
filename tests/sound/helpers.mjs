// Helpers for the sound system tests: render fills, capture a channel's log samples, measure.
import { SoundSystem } from '../../src/core/sound/system.js';
import { LOG_TO_LINEAR } from '../../src/core/sound/tables.js';

/** A fresh sound system (not the shared one, no clock). */
export const fresh = (opts) => new SoundSystem(opts);

/**
 * Run n fills; returns {L, R} (Float32Array, the mixed output) and ch (Int16Array: channel c's
 * samples decoded to linear, -3952..3952) and amp (the WaveSynth amplitude register after each fill).
 */
export function render(sys, n, c = 1) {
  const len = sys.bufLen;
  const L = new Float32Array(n * len), R = new Float32Array(n * len), ch = new Int16Array(n * len);
  const amp = [], flags = [];
  for (let k = 0; k < n; k++) {
    if (sys.fill()) { L.set(sys.left, k * len); R.set(sys.right, k * len); }
    const b = sys.bufs[c - 1][sys.fills & 1];
    if (c - 1 < sys.nchan) for (let i = 0; i < len; i++) ch[k * len + i] = LOG_TO_LINEAR[b[i]];
    amp.push(sys.chan[c - 1].p3);
    flags.push(sys.chan[c - 1].flags);
  }
  return { L, R, ch, amp, flags };
}

/** Peak absolute value of a[from..to). */
export function peak(a, from = 0, to = a.length) {
  let m = 0;
  for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i]));
  return m;
}

/** RMS of a[from..to). */
export function rms(a, from = 0, to = a.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Fundamental period in samples by normalised autocorrelation (best lag in [minLag, maxLag]). */
export function period(a, from, to, minLag = 8, maxLag = 600) {
  const x = Array.from(a.slice(from, to));
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  for (let i = 0; i < x.length; i++) x[i] -= mean;
  let best = 0, bestLag = 0;
  const ac = [];
  for (let lag = minLag; lag <= maxLag && lag < x.length / 2; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i + lag < x.length; i++) { s += x[i] * x[i + lag]; e1 += x[i] * x[i]; e2 += x[i + lag] * x[i + lag]; }
    ac[lag] = s / Math.sqrt(e1 * e2 || 1);
  }
  // first peak that is close to the global maximum (avoids picking a multiple of the period)
  for (let lag = minLag; lag < ac.length; lag++) if (ac[lag] > best) best = ac[lag];
  for (let lag = minLag + 1; lag < ac.length - 1; lag++) {
    if (ac[lag] >= 0.9 * best && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) { bestLag = lag; break; }
  }
  // parabolic interpolation around the peak
  const y0 = ac[bestLag - 1] ?? 0, y1 = ac[bestLag], y2 = ac[bestLag + 1] ?? 0;
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  return { lag: bestLag + d, corr: y1 };
}

/** Zero crossings (sign changes, zeros ignored) per second. */
export function crossingRate(a, from, to, sampleRate) {
  let n = 0, last = 0;
  for (let i = from; i < to; i++) { const s = Math.sign(a[i]); if (s && last && s !== last) n++; if (s) last = s; }
  return n / 2 / ((to - from) / sampleRate);
}
