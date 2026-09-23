// Sound decoding and playback shared by !Player and !ARPlayer.
//
// Decoders: Acorn Replay (ARMovie, type &AE7) sound tracks (4 bit IMA ADPCM with per-chunk
// state headers, 8 bit linear/exponential, 16 bit linear), RIFF WAVE (&FB1 / &BF7), and raw
// sample data in the formats the Player's "Control" window offers (signed / unsigned linear,
// Archimedes (VIDC) mu-law, ADPCM; 4/8/12/16 bits; mono/stereo, reversed).
// Playback: a small WebAudio "voice" with play / pause / stop / seek / loop / volume / mute.

const latin1 = (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };

// ------------------------------------------------------------------ ARMovie

/** Parse the ARMovie text header. Returns null if the data is not an ARMovie file. */
export function parseARMovie(bytes) {
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, 4096)));
  if (!head.startsWith('ARMovie')) return null;
  const L = head.split('\n');
  const num = (i) => { const m = /-?\d+(\.\d+)?/.exec(L[i] ?? ''); return m ? parseFloat(m[0]) : 0; };
  const mv = {
    lines: L.slice(0, 21),
    name: (L[1] ?? '').trim(), date: (L[2] ?? '').trim(), author: (L[3] ?? '').trim(),
    videoFormat: num(4), videoFormatText: (L[4] ?? '').trim(),
    width: num(5), height: num(6), depthText: (L[7] ?? '').trim(), fps: num(8) || 12.5, fpsText: (L[8] ?? '').trim(),
    soundFormat: num(9), soundFormatText: (L[9] ?? '').trim(),
    rateText: (L[10] ?? '').trim(), channelsText: (L[11] ?? '').trim(), bitsText: (L[12] ?? '').trim(),
    framesPerChunk: num(13), chunks: num(14), evenChunk: num(15), oddChunk: num(16),
    catalogueOffset: num(17), spriteOffset: num(18), spriteSize: num(19), keyOffset: num(20),
  };
  // sample rate: "22050 Hz samples", or (old style) a sample period in microseconds
  let rate = num(10);
  if (!/hz/i.test(mv.rateText) && rate > 0 && rate < 256) rate = Math.round(1e6 / rate);
  mv.rate = rate;
  mv.channels = Math.max(1, num(11) || 1);
  mv.reversed = /revers/i.test(mv.channelsText);
  mv.bits = num(12) || 8;
  const bt = mv.bitsText.toLowerCase();
  mv.encoding = mv.soundFormat === 2 || /adpcm/.test(bt) || /adpcm/i.test(mv.soundFormatText) ? 'adpcm'
    : /expon|log|law/.test(bt) ? 'mulaw' : /unsign/.test(bt) ? 'unsigned' : 'signed';
  if (mv.encoding === 'adpcm') mv.bits = 4;
  // catalogue: "FO,VS;SS" lines, one per chunk (chunks numbered 0..n)
  mv.catalogue = [];
  if (mv.catalogueOffset > 0 && mv.catalogueOffset < bytes.length) {
    const cat = latin1(bytes.subarray(mv.catalogueOffset, Math.min(bytes.length, mv.catalogueOffset + 32 * (mv.chunks + 2) + 64)));
    for (const line of cat.split('\n')) {
      const m = /^\s*(\d+)\s*,\s*(\d+)\s*;\s*(\d+)/.exec(line);
      if (!m) break;
      mv.catalogue.push({ offset: +m[1], video: +m[2], sound: +m[3] });
      if (mv.catalogue.length > mv.chunks) break;
    }
  }
  mv.hasSound = mv.soundFormat !== 0 && mv.rate > 0;
  return mv;
}

/** Decode an ARMovie's (first) sound track to {rate, channels: Float32Array[]}. */
export function decodeARMovieSound(bytes, mv = parseARMovie(bytes)) {
  if (!mv || !mv.hasSound) return null;
  const nch = mv.channels;
  const parts = [];
  let total = 0;
  for (const c of mv.catalogue) {
    const start = c.offset + c.video;
    let data = bytes.subarray(start, Math.min(bytes.length, start + c.sound));
    let chans;
    if (mv.encoding === 'adpcm') {
      // each chunk starts with the coder state for each channel: valprev (int16), index, 0
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const st = [];
      for (let ch = 0; ch < nch; ch++) st.push({ val: data.length >= 4 * ch + 4 ? dv.getInt16(4 * ch, true) : 0, index: data[4 * ch + 2] ?? 0 });
      chans = decodeADPCM(data.subarray(4 * nch), nch, st);
    } else {
      if (mv.bits === 16 && (data.byteOffset & 1)) data = data.slice();
      chans = decodeRaw(data, { type: mv.encoding, bits: mv.bits, channels: nch });
    }
    parts.push(chans);
    total += chans[0].length;
  }
  const out = Array.from({ length: nch }, () => new Float32Array(total));
  let p = 0;
  for (const chs of parts) { for (let c = 0; c < nch; c++) out[c].set(chs[c], p); p += chs[0].length; }
  if (mv.reversed && nch === 2) out.reverse();
  return { rate: mv.rate, channels: out };
}

// ------------------------------------------------------------------ IMA ADPCM

const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80,
  88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
  5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

/**
 * Decode 4 bit ADPCM (Jansen / IMA coder, as used by Replay). Mono: high nibble first (checked
 * against the AudioDemos); stereo: each byte holds left (low nibble) and right (high nibble), as
 * written by Replay's Join tool.
 */
export function decodeADPCM(data, nch = 1, state = null) {
  const st = state ?? Array.from({ length: nch }, () => ({ val: 0, index: 0 }));
  const n = nch === 1 ? data.length * 2 : data.length;
  const out = Array.from({ length: nch }, () => new Float32Array(n));
  const step = (s, delta) => {
    let stp = IMA_STEP[s.index];
    let diff = stp >> 3;
    if (delta & 4) diff += stp;
    if (delta & 2) diff += stp >> 1;
    if (delta & 1) diff += stp >> 2;
    s.val += delta & 8 ? -diff : diff;
    if (s.val > 32767) s.val = 32767; else if (s.val < -32768) s.val = -32768;
    s.index += IMA_INDEX[delta];
    if (s.index < 0) s.index = 0; else if (s.index > 88) s.index = 88;
    return s.val / 32768;
  };
  for (const s of st) { s.index = Math.max(0, Math.min(88, s.index | 0)); }
  if (nch === 1) {
    const o = out[0], s = st[0];
    for (let i = 0; i < data.length; i++) { const b = data[i]; o[2 * i] = step(s, b >> 4); o[2 * i + 1] = step(s, b & 15); }
  } else {
    for (let i = 0; i < data.length; i++) { const b = data[i]; out[0][i] = step(st[0], b & 15); out[1][i] = step(st[1], b >> 4); }
  }
  return out;
}

// ------------------------------------------------------------------ raw sample data

/** VIDC 8 bit logarithmic ("Archimedes mu-law"): bit 0 sign, bits 1-7 magnitude. */
export function vidcLogToLinear(b) {
  const mag = b >> 1;
  const e = mag >> 4, m = mag & 15;
  const lin = (((m << 3) + 0x84) << e) - 0x84;   // 0 .. 32124
  return (b & 1 ? -lin : lin) / 32768;
}

/**
 * Decode raw sample data. opts: {type: 'signed'|'unsigned'|'mulaw'|'adpcm', bits: 4|8|12|16,
 * channels: 1|2, reversed}. Returns Float32Array per channel.
 */
export function decodeRaw(data, { type = 'signed', bits = 8, channels = 1, reversed = false } = {}) {
  const nch = channels === 2 ? 2 : 1;
  let mono;
  if (type === 'adpcm' || bits === 4) {
    const r = decodeADPCM(data, nch);
    if (reversed && nch === 2) r.reverse();
    return r;
  }
  if (type === 'mulaw') {
    mono = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) mono[i] = vidcLogToLinear(data[i]);
  } else if (bits === 16) {
    const n = data.length >> 1;
    mono = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = data[2 * i] | (data[2 * i + 1] << 8);
      if (type === 'unsigned') v -= 32768; else if (v & 0x8000) v -= 0x10000;
      mono[i] = v / 32768;
    }
  } else if (bits === 12) {
    // 12 bit samples packed in 16 bit words (top 12 bits significant)
    const n = data.length >> 1;
    mono = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = (data[2 * i] | (data[2 * i + 1] << 8)) & 0xFFF0;
      if (type === 'unsigned') v -= 32768; else if (v & 0x8000) v -= 0x10000;
      mono[i] = v / 32768;
    }
  } else {
    mono = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      mono[i] = (type === 'unsigned' ? b - 128 : (b << 24 >> 24)) / 128;
    }
  }
  if (nch === 1) return [mono];
  const n = mono.length >> 1;
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = mono[2 * i]; r[i] = mono[2 * i + 1]; }
  return reversed ? [r, l] : [l, r];
}

// ------------------------------------------------------------------ RIFF WAVE

/** Parse a RIFF WAVE file: {rate, channels, bits, format, type, data (Uint8Array)} or null. */
export function parseWav(bytes) {
  if (bytes.length < 12 || latin1(bytes.subarray(0, 4)) !== 'RIFF' || latin1(bytes.subarray(8, 12)) !== 'WAVE') return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= bytes.length) {
    const id = latin1(bytes.subarray(p, p + 4));
    const len = dv.getUint32(p + 4, true);
    const body = bytes.subarray(p + 8, Math.min(bytes.length, p + 8 + len));
    if (id === 'fmt ' && body.length >= 16) {
      const d = new DataView(body.buffer, body.byteOffset, body.byteLength);
      fmt = { format: d.getUint16(0, true), channels: d.getUint16(2, true), rate: d.getUint32(4, true), bits: d.getUint16(14, true) };
    } else if (id === 'data') data = body;
    p += 8 + len + (len & 1);
  }
  if (!fmt || !data) return null;
  let type = fmt.bits === 8 ? 'unsigned' : 'signed';
  if (fmt.format === 7) type = 'ulaw';
  else if (fmt.format === 6) type = 'alaw';
  else if (fmt.format === 0x11) type = 'imaadpcm';
  return { ...fmt, type, data };
}

function g711(b, alaw) {
  if (alaw) {
    b ^= 0x55;
    let t = (b & 15) << 4; const seg = (b & 0x70) >> 4;
    t = seg === 0 ? t + 8 : seg === 1 ? t + 0x108 : (t + 0x108) << (seg - 1);
    return (b & 0x80 ? t : -t) / 32768;
  }
  b = ~b & 0xFF;
  let t = ((b & 15) << 3) + 0x84; t <<= (b & 0x70) >> 4;
  return (b & 0x80 ? 0x84 - t : t - 0x84) / 32768;
}

/** Decode a parsed WAV to {rate, channels: Float32Array[]}. */
export function decodeWav(w) {
  const nch = Math.max(1, w.channels);
  if (w.type === 'ulaw' || w.type === 'alaw') {
    const n = Math.floor(w.data.length / nch);
    const out = Array.from({ length: nch }, () => new Float32Array(n));
    for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) out[c][i] = g711(w.data[i * nch + c], w.type === 'alaw');
    return { rate: w.rate, channels: out };
  }
  if (w.type === 'imaadpcm') return null;
  const bits = w.bits > 8 ? 16 : 8;
  let data = w.data;
  if (bits === 16 && (data.byteOffset & 1)) data = data.slice();
  const bps = bits / 8;
  if (nch <= 2) return { rate: w.rate, channels: decodeRaw(data, { type: w.type, bits, channels: nch }) };
  // more than two channels: keep the first two
  const n = Math.floor(data.length / (bps * nch));
  const tmp = new Uint8Array(n * 2 * bps);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) for (let k = 0; k < bps; k++) tmp[(i * 2 + c) * bps + k] = data[(i * nch + c) * bps + k];
  return { rate: w.rate, channels: decodeRaw(tmp, { type: w.type, bits, channels: 2 }) };
}

// ------------------------------------------------------------------ playback

let ctx = null;
export function audioContext() {
  if (!ctx) {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/**
 * One playing sound. new Voice(); voice.load({rate, channels}); voice.play(fromSec); pause(); stop();
 * voice.position (seconds), voice.duration, voice.loop, voice.setVolume(0..1), voice.setMute(bool),
 * voice.onend = fn.
 */
export class Voice {
  constructor() {
    this.buffer = null; this.src = null; this.gain = null;
    this.loop = false; this.volume = 1; this.muted = false;
    this.rate = 1; this._startCtx = 0; this._startPos = 0; this._pos = 0;
    this.playing = false; this.paused = false; this.onend = null;
  }
  /** snd: {rate, channels: Float32Array[]}; playRate: sample rate to play at (default snd.rate). */
  load(snd, playRate) {
    this.stop();
    const ac = audioContext();
    this.snd = snd;
    this.frames = snd?.channels?.[0]?.length ?? 0;
    this.baseRate = snd?.rate || 22050;
    this.setRate(playRate ?? this.baseRate);
    if (!ac || !this.frames) { this.buffer = null; return; }
    const br = Math.min(192000, Math.max(3000, this.baseRate));
    const buf = ac.createBuffer(snd.channels.length, this.frames, br);
    snd.channels.forEach((d, i) => buf.copyToChannel(d, i));
    this.buffer = buf;
    this._pos = 0;
  }
  setRate(r) {
    const was = this.playing ? this.position : null;
    this.playRate = r;
    const br = Math.min(192000, Math.max(3000, this.baseRate || r));
    this.speed = r / br;
    if (was != null) { this._stopSrc(); this.play(was); }
  }
  /** Duration in seconds at the current play rate. */
  get duration() { return this.frames / (this.playRate || 1); }
  get position() {
    if (!this.playing || !ctx) return this._pos;
    let p = this._startPos + (ctx.currentTime - this._startCtx) * this.speed * (this.buffer ? this.buffer.sampleRate : 1) / (this.playRate || 1);
    if (this.loop && this.duration > 0) p %= this.duration;
    return Math.min(p, this.duration);
  }
  _stopSrc() {
    if (this.src) { this.src.onended = null; try { this.src.stop(); } catch { /* */ } this.src.disconnect(); this.src = null; }
  }
  play(from = this._pos) {
    const ac = audioContext();
    this._stopSrc();
    this.paused = false;
    if (!ac || !this.buffer) { this.playing = false; return false; }
    if (from >= this.duration) from = 0;
    this.gain ??= ac.createGain();
    this.gain.connect(ac.destination);
    this._applyGain();
    const s = ac.createBufferSource();
    s.buffer = this.buffer;
    s.playbackRate.value = this.speed;
    s.loop = this.loop;
    s.connect(this.gain);
    // buffer time = frames / bufferRate; our position is in "play seconds" (frames / playRate)
    const bufOffset = from * this.playRate / this.buffer.sampleRate;
    s.start(0, bufOffset);
    s.onended = () => { if (this.src !== s) return; this.src = null; this.playing = false; this._pos = 0; this.onend?.(); };
    this.src = s;
    this._startCtx = ac.currentTime; this._startPos = from;
    this.playing = true;
    return true;
  }
  pause() {
    if (!this.playing) return;
    this._pos = this.position;
    this._stopSrc();
    this.playing = false; this.paused = true;
  }
  resume() { if (this.paused) this.play(this._pos); }
  stop() { this._stopSrc(); this.playing = false; this.paused = false; this._pos = 0; }
  seek(t) { t = Math.max(0, Math.min(this.duration, t)); if (this.playing) this.play(t); else this._pos = t; }
  setLoop(on) { this.loop = on; if (this.src) this.src.loop = on; }
  setVolume(v) { this.volume = v; this._applyGain(); }
  setMute(m) { this.muted = m; this._applyGain(); }
  _applyGain() { if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume; }
}
